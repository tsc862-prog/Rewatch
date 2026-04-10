// ── Event Search + Card ───────────────────────────────────────────────────────

let eventAcIdx = -1, eventAcResults = [];
let eventSearchTimer = null;
let currentEvent = null;
let currentEventFights = [];
let eventFightRatings = new Map(); // fightId → { rating }
let savingFights = new Set(); // prevent double-saves

// ── Event Autocomplete ───────────────────────────────────────────────────────

function eventSearch() {
  clearTimeout(eventSearchTimer);
  eventSearchTimer = setTimeout(doEventSearch, 300);
}

async function doEventSearch() {
  const q  = document.getElementById('event-search').value.trim();
  const ac = document.getElementById('event-ac');
  eventAcIdx = -1;
  if (q.length < 2) { ac.style.display = 'none'; return; }

  const { data, error } = await sb
    .from('events')
    .select('*')
    .ilike('name', `%${q}%`)
    .order('date', { ascending: false })
    .limit(10);

  if (error || !data?.length) { ac.style.display = 'none'; eventAcResults = []; return; }

  eventAcResults = data;
  const ql = q.toLowerCase();
  ac.innerHTML = data.map((evt, i) => {
    return `<div class="ac-item" onmousedown="eventAcPick(event,${i})">
      <div>${hl(evt.name, ql)}</div>
      <div class="ac-meta">${evt.date || '—'}${evt.location ? ' · ' + evt.location : ''}</div>
    </div>`;
  }).join('');
  ac.style.display = 'block';
}

function eventSearchKey(e) {
  const ac = document.getElementById('event-ac');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length || ac.style.display === 'none') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); eventAcIdx = Math.min(eventAcIdx+1, items.length-1); items.forEach((el,i) => el.classList.toggle('focused', i===eventAcIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); eventAcIdx = Math.max(0, eventAcIdx-1); items.forEach((el,i) => el.classList.toggle('focused', i===eventAcIdx)); }
  else if (e.key === 'Enter') { if (eventAcIdx >= 0) { e.preventDefault(); selectEvent(eventAcResults[eventAcIdx]); } ac.style.display='none'; }
  else if (e.key === 'Escape') { ac.style.display = 'none'; }
}

function eventBlur() { setTimeout(() => { document.getElementById('event-ac').style.display = 'none'; }, 150); }
function eventAcPick(e, i) { e.preventDefault(); selectEvent(eventAcResults[i]); }

// ── Event Card ───────────────────────────────────────────────────────────────

async function selectEvent(evt) {
  currentEvent = evt;
  eventFightRatings.clear();
  document.getElementById('event-search').value = evt.name;
  document.getElementById('event-ac').style.display = 'none';

  const { data, error } = await sb
    .from('fight_search')
    .select('*')
    .eq('event_id', evt.id);

  if (error) { showToast('Error loading fights: ' + error.message); return; }

  // Sort by fight_position (nulls last)
  currentEventFights = (data || []).sort((a, b) => {
    const pa = a.fight_position != null ? a.fight_position : 9999;
    const pb = b.fight_position != null ? b.fight_position : 9999;
    return pa - pb;
  });
  renderEventCard();
}

function renderEventCard() {
  const el = document.getElementById('event-card');
  const rated = currentEventFights.filter(f => myRatings.some(r => r.fight_id === f.id)).length;

  el.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <div class="event-header">
        <div>
          <div class="event-header-left">
            <button class="btn btn-outline btn-sm" onclick="closeEvent()">← Back</button>
            <span class="event-title">${escHtml(currentEvent.name)}</span>
          </div>
          <div class="event-meta">
            ${currentEvent.date ? `<span>${currentEvent.date}</span>` : ''}
            ${currentEvent.location ? `<span>${currentEvent.location}</span>` : ''}
          </div>
        </div>
        <span class="event-progress" id="event-progress">${rated} / ${currentEventFights.length} rated</span>
      </div>
      <div class="event-fights">
        ${currentEventFights.map(f => renderFightRow(f)).join('')}
      </div>
    </div>`;

  el.style.display = 'block';
  document.getElementById('event-search-card').style.display = 'none';
}

function renderFightRow(fight) {
  const rating = myRatings.find(r => r.fight_id === fight.id);
  const isRated = !!rating;
  const currentVal = isRated ? (rating.rating || 0) : 0;
  const notes = isRated ? (rating.notes || '') : '';

  eventFightRatings.set(fight.id, { rating: currentVal });

  const resultHtml = isRated
    ? `<div class="fight-row-result revealed">
        ${fight.winner_name ? `<span><strong>W:</strong> ${escHtml(fight.winner_name)}</span>` : '<span>Draw / NC</span>'}
        ${fight.method ? `<span>${escHtml(fight.method)}</span>` : ''}
        ${fight.round ? `<span>R${fight.round}${fight.time ? ' · '+fight.time : ''}</span>` : ''}
      </div>`
    : `<div class="fight-row-result spoiler">Rate this fight to reveal the result</div>`;

  return `
    <div class="fight-row ${isRated ? 'rated' : ''}" id="fight-row-${fight.id}">
      <div class="fight-row-top">
        <div>
          ${fight.fight_position_type ? '<span class="pos-type-tag pos-'+slugPosType(fight.fight_position_type)+'">'+escHtml(fight.fight_position_type)+'</span> · ' : ''}
          ${fight.is_title ? '<span class="title-tag">TITLE BOUT</span> · ' : ''}
          <span class="fight-row-wc">${escHtml(fight.weight_class || '—')}</span>
        </div>
        ${isRated ? '<span class="rated-check">✓ rated</span>' : ''}
      </div>
      <div class="fight-row-matchup">${fight.fighter1_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter1_rank)+'</span> ' : ''}${escHtml(fight.fighter1_name)} vs ${fight.fighter2_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter2_rank)+'</span> ' : ''}${escHtml(fight.fighter2_name)}</div>
      ${fight.notes ? '<div class="fight-row-notes-info">'+escHtml(fight.notes)+'</div>' : ''}
      <div class="fight-row-bottom">
        <div class="fight-row-controls">
          <div class="fight-row-stars" id="stars-${fight.id}">${buildClickableStars(fight.id, currentVal)}</div>
          <span class="fight-row-rating-lbl" id="star-lbl-${fight.id}">${currentVal ? currentVal+'/5' : '—'}</span>
          <input type="text" class="fight-row-notes" id="notes-${fight.id}" placeholder="Notes…" value="${escHtml(notes)}"
            onblur="saveNotes('${fight.id}')">
        </div>
        <div id="result-${fight.id}">${resultHtml}</div>
      </div>
    </div>`;
}

function closeEvent() {
  document.getElementById('event-card').style.display = 'none';
  document.getElementById('event-search-card').style.display = 'block';
  document.getElementById('event-search').value = '';
  currentEvent = null;
  currentEventFights = [];
  eventFightRatings.clear();
}

function updateEventProgress() {
  const el = document.getElementById('event-progress');
  if (!el) return;
  const rated = currentEventFights.filter(f => myRatings.some(r => r.fight_id === f.id)).length;
  el.textContent = `${rated} / ${currentEventFights.length} rated`;
}

// ── Per-Fight Stars (with half-star support) ─────────────────────────────────

function buildClickableStars(fightId, currentVal, size) {
  size = size || 20;
  let h = '';
  for (let i = 1; i <= 5; i++) {
    const fill = currentVal >= i ? 'full' : currentVal >= i-0.5 ? 'half' : 'empty';
    h += `<span class="fight-star"
      onmousemove="moveFightStar(event,'${fightId}',${i})"
      onmouseout="hoverFightStars('${fightId}',0)"
      onclick="clickFightStar(event,'${fightId}',${i})">${starSVG(fill, size)}</span>`;
  }
  return h;
}

function moveFightStar(e, fightId, starNum) {
  const rect = e.currentTarget.getBoundingClientRect();
  const val = e.clientX < rect.left + rect.width / 2 ? starNum - 0.5 : starNum;
  hoverFightStars(fightId, val);
}

function clickFightStar(e, fightId, starNum) {
  const rect = e.currentTarget.getBoundingClientRect();
  const val = e.clientX < rect.left + rect.width / 2 ? starNum - 0.5 : starNum;
  setFightRating(fightId, val);
}

function hoverFightStars(fightId, val) {
  const el = document.getElementById('stars-' + fightId);
  if (!el) return;
  const state = eventFightRatings.get(fightId);
  const d = val || (state ? state.rating : 0);
  el.querySelectorAll('.fight-star').forEach((s, idx) => {
    const i = idx + 1;
    s.innerHTML = starSVG(d >= i ? 'full' : d >= i - 0.5 ? 'half' : 'empty', 20);
  });
  const lbl = document.getElementById('star-lbl-' + fightId);
  if (lbl) lbl.textContent = d ? d + '/5' : '—';
}

function setFightRating(fightId, val) {
  if (!eventFightRatings.has(fightId)) {
    eventFightRatings.set(fightId, { rating: 0 });
  }
  eventFightRatings.get(fightId).rating = val;
  hoverFightStars(fightId, val);
  // Auto-save
  saveFightRating(fightId);
}

// ── Auto-Save ────────────────────────────────────────────────────────────────

async function saveFightRating(fightId) {
  const state = eventFightRatings.get(fightId);
  if (!state || !state.rating) return;
  if (savingFights.has(fightId)) return; // prevent double-save
  savingFights.add(fightId);

  const notesEl = document.getElementById('notes-' + fightId);
  const notesVal = notesEl ? notesEl.value.trim() : '';

  const entry = {
    fight_id:  fightId,
    rating:    state.rating,
    notes:     notesVal || null,
    logged_at: Date.now()
  };

  const existing = myRatings.find(x => x.fight_id === fightId);
  let error;
  if (existing) {
    ({ error } = await sb.from('ratings').update(entry).eq('fight_id', fightId));
  } else {
    ({ error } = await sb.from('ratings').insert(entry));
  }

  savingFights.delete(fightId);

  if (error) { showToast('Error: ' + error.message); return; }

  // Update local cache
  const fight = currentEventFights.find(f => f.id === fightId);
  const fullEntry = { ...fight, ...entry };
  const idx = myRatings.findIndex(x => x.fight_id === fightId);
  if (idx >= 0) myRatings[idx] = fullEntry; else myRatings.unshift(fullEntry);

  // Re-render just this fight row to reveal result
  const row = document.getElementById('fight-row-' + fightId);
  if (row) row.outerHTML = renderFightRow(fight);

  updateEventProgress();
  showToast(existing ? 'Rating updated' : 'Fight rated!');
}

// Save notes on blur (if fight is already rated)
async function saveNotes(fightId) {
  const existing = myRatings.find(x => x.fight_id === fightId);
  if (!existing) return; // only save notes if fight is already rated

  const notesEl = document.getElementById('notes-' + fightId);
  const notesVal = notesEl ? notesEl.value.trim() : '';
  if ((existing.notes || '') === notesVal) return; // no change

  const { error } = await sb.from('ratings')
    .update({ notes: notesVal || null })
    .eq('fight_id', fightId);

  if (error) { showToast('Error saving notes'); return; }

  existing.notes = notesVal || null;
  showToast('Notes saved');
}
