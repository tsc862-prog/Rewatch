// ── Event Search + Card ───────────────────────────────────────────────────────

let eventAcIdx = -1, eventAcResults = [];
let eventSearchTimer = null;
let currentEvent = null;
let currentEventFights = [];
let eventFightRatings = new Map(); // fightId → { rating }
let savingFights = new Set(); // prevent double-saves
const epFighterIds = new Map(); // fightId → { f1Id, f1Name, f2Id, f2Name }
const epFighterTimers = {};

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

function renderFightRow(fight, opts) {
  opts = opts || {};
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
        <div style="display:flex;align-items:center;gap:8px">
        ${isRated ? '<span class="rated-check">✓ rated</span>' : ''}
        <button class="btn btn-outline btn-sm fight-edit-btn" onclick="toggleFightEdit('${fight.id}')">Edit</button>
      </div>
      </div>
      <div class="fight-row-matchup">${fight.fighter1_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter1_rank)+'</span> ' : ''}${escHtml(fight.fighter1_name)} vs ${fight.fighter2_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter2_rank)+'</span> ' : ''}${escHtml(fight.fighter2_name)}</div>
      ${opts.showEvent && fight.event_name ? '<div class="fight-row-event-meta">'+escHtml(fight.event_name)+(fight.event_date?' · '+fight.event_date:'')+'</div>' : ''}
      ${fight.notes ? '<div class="fight-row-notes-info">'+escHtml(fight.notes)+'</div>' : ''}
      <div class="fight-row-bottom">
        <div class="fight-row-controls">
          <div class="fight-row-stars" id="stars-${fight.id}">${buildClickableStars(fight.id, currentVal)}</div>
          <span class="fight-row-rating-lbl" id="star-lbl-${fight.id}">${currentVal ? currentVal+'/5' : '—'}</span>
        </div>
        <div id="result-${fight.id}">${resultHtml}</div>
      </div>
      <textarea class="fight-row-notes" id="notes-${fight.id}" placeholder="Notes…"
        onblur="saveNotes('${fight.id}')">${escHtml(notes)}</textarea>
      <div class="fight-row-edit-panel" id="edit-panel-${fight.id}" style="display:none">${buildFightEditPanel(fight)}</div>
    </div>`;
}

// ── Inline Fight Edit ────────────────────────────────────────────────────────

function buildFightEditPanel(fight) {
  // Initialise fighter state with current values so save works without changing anything
  epFighterIds.set(fight.id, {
    f1Id: fight.fighter1_id, f1Name: fight.fighter1_name || '',
    f2Id: fight.fighter2_id, f2Name: fight.fighter2_name || ''
  });

  const wcOptions = ['','Strawweight','Flyweight','Bantamweight','Featherweight','Lightweight','Welterweight','Middleweight','Light Heavyweight','Heavyweight',
    "Women's Strawweight","Women's Flyweight","Women's Bantamweight","Women's Featherweight"]
    .map(w => `<option value="${w}"${w===(fight.weight_class||'')?' selected':''}>${w||'—'}</option>`).join('');

  const ptOptions = ['','Main Event','Main Card','Prelim']
    .map(p => `<option value="${p}"${p===(fight.fight_position_type||'')?' selected':''}>${p||'—'}</option>`).join('');

  const wid = fight.winner_id || '';

  return `
    <div class="fight-edit-section">
      <div class="fight-edit-row">
        <div class="fight-edit-field" style="position:relative">
          <label>Fighter 1</label>
          <input type="text" id="ep-f1-${fight.id}" class="admin-input" value="${escHtml(fight.fighter1_name||'')}" autocomplete="off"
            oninput="epFighterSearch('${fight.id}','f1')"
            onblur="setTimeout(()=>{const el=document.getElementById('ep-f1-ac-${fight.id}');if(el)el.style.display='none'},150)">
          <div class="ac-dropdown" id="ep-f1-ac-${fight.id}" style="display:none"></div>
        </div>
        <div class="fight-edit-field" style="position:relative">
          <label>Fighter 2</label>
          <input type="text" id="ep-f2-${fight.id}" class="admin-input" value="${escHtml(fight.fighter2_name||'')}" autocomplete="off"
            oninput="epFighterSearch('${fight.id}','f2')"
            onblur="setTimeout(()=>{const el=document.getElementById('ep-f2-ac-${fight.id}');if(el)el.style.display='none'},150)">
          <div class="ac-dropdown" id="ep-f2-ac-${fight.id}" style="display:none"></div>
        </div>
      </div>
      <div class="fight-edit-row">
        <div class="fight-edit-field">
          <label>Division</label>
          <select id="ep-wc-${fight.id}" class="admin-input">${wcOptions}</select>
        </div>
        <div class="fight-edit-field">
          <label>Card position</label>
          <select id="ep-pt-${fight.id}" class="admin-input">${ptOptions}</select>
        </div>
        <div class="fight-edit-field fight-edit-field--narrow">
          <label>F1 rank</label>
          <input type="text" id="ep-f1r-${fight.id}" class="admin-input" value="${escHtml(fight.fighter1_rank||'')}" placeholder="C, 1…">
        </div>
        <div class="fight-edit-field fight-edit-field--narrow">
          <label>F2 rank</label>
          <input type="text" id="ep-f2r-${fight.id}" class="admin-input" value="${escHtml(fight.fighter2_rank||'')}" placeholder="C, 1…">
        </div>
        <label class="fight-edit-checkbox"><input type="checkbox" id="ep-title-${fight.id}" ${fight.is_title?'checked':''}> Title bout</label>
      </div>
      <div class="fight-edit-row">
        <div class="fight-edit-field" style="flex:2">
          <label>Fight notes</label>
          <input type="text" id="ep-notes-${fight.id}" class="admin-input" value="${escHtml(fight.notes||'')}" placeholder="Catchweight, missed weight…">
        </div>
      </div>
      <div class="fight-edit-divider">Result</div>
      <div class="fight-edit-row">
        <div class="fight-edit-field">
          <label>Winner</label>
          <select id="ep-winner-${fight.id}" class="admin-input">
            <option value="">Draw / NC</option>
            <option value="${fight.fighter1_id}" ${wid===fight.fighter1_id?'selected':''}>${escHtml(fight.fighter1_name||'')}</option>
            <option value="${fight.fighter2_id}" ${wid===fight.fighter2_id?'selected':''}>${escHtml(fight.fighter2_name||'')}</option>
          </select>
        </div>
        <div class="fight-edit-field" style="flex:2">
          <label>Method</label>
          <input type="text" id="ep-method-${fight.id}" class="admin-input" value="${escHtml(fight.method||'')}" placeholder="KO/TKO, Decision (Unanimous)…">
        </div>
        <div class="fight-edit-field">
          <label>Type</label>
          <select id="ep-mbroad-${fight.id}" class="admin-input">
            <option value="">—</option>
            <option ${fight.method_broad==='KO/TKO'?'selected':''}>KO/TKO</option>
            <option ${fight.method_broad==='Submission'?'selected':''}>Submission</option>
            <option ${fight.method_broad==='Decision'?'selected':''}>Decision</option>
            <option ${fight.method_broad==='No Contest'?'selected':''}>No Contest</option>
            <option ${fight.method_broad==='Draw'?'selected':''}>Draw</option>
          </select>
        </div>
        <div class="fight-edit-field fight-edit-field--narrow">
          <label>Round</label>
          <input type="number" id="ep-round-${fight.id}" class="admin-input" min="1" max="5" value="${fight.round||''}">
        </div>
        <div class="fight-edit-field fight-edit-field--narrow">
          <label>Time</label>
          <input type="text" id="ep-time-${fight.id}" class="admin-input" value="${escHtml(fight.time||'')}" placeholder="4:35">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
        <button class="btn btn-red btn-sm" onclick="saveFightEdit('${fight.id}')">Save</button>
        <button class="btn btn-outline btn-sm" onclick="toggleFightEdit('${fight.id}')">Cancel</button>
        <button class="btn-danger" style="margin-left:auto" onclick="deleteFightFromCard('${fight.id}')">Delete fight</button>
      </div>
    </div>`;
}

function epFighterSearch(fightId, which) {
  const key = fightId + which;
  clearTimeout(epFighterTimers[key]);
  epFighterTimers[key] = setTimeout(() => doEpFighterSearch(fightId, which), 300);
}

async function doEpFighterSearch(fightId, which) {
  const input = document.getElementById('ep-' + which + '-' + fightId);
  const ac = document.getElementById('ep-' + which + '-ac-' + fightId);
  if (!input || !ac) return;
  const q = input.value.trim();
  if (q.length < 2) { ac.style.display = 'none'; return; }

  const { data } = await sb.from('fighters').select('id, name')
    .ilike('name', `%${q}%`).order('name').limit(8);
  if (!data?.length) { ac.style.display = 'none'; return; }

  const ql = q.toLowerCase();
  ac.innerHTML = data.map(f =>
    `<div class="ac-item" onmousedown="epPickFighter('${fightId}','${which}','${f.id}','${escHtml(f.name)}')">${hl(f.name, ql)}</div>`
  ).join('');
  ac.style.display = 'block';
}

function epPickFighter(fightId, which, id, name) {
  const state = epFighterIds.get(fightId) || {};
  if (which === 'f1') { state.f1Id = id; state.f1Name = name; }
  else               { state.f2Id = id; state.f2Name = name; }
  epFighterIds.set(fightId, state);

  const input = document.getElementById('ep-' + which + '-' + fightId);
  const ac    = document.getElementById('ep-' + which + '-ac-' + fightId);
  if (input) input.value = name;
  if (ac) ac.style.display = 'none';

  // Keep winner dropdown in sync with updated fighter names/IDs
  const winnerSel = document.getElementById('ep-winner-' + fightId);
  if (winnerSel) {
    const f1Id   = state.f1Id   || '';
    const f2Id   = state.f2Id   || '';
    const f1Name = state.f1Name || '';
    const f2Name = state.f2Name || '';
    const cur    = winnerSel.value;
    winnerSel.innerHTML =
      `<option value="">Draw / NC</option>` +
      `<option value="${f1Id}"${cur===f1Id?' selected':''}>${escHtml(f1Name)}</option>` +
      `<option value="${f2Id}"${cur===f2Id?' selected':''}>${escHtml(f2Name)}</option>`;
  }
}

function toggleFightEdit(fightId) {
  const panel = document.getElementById('edit-panel-' + fightId);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function saveFightEdit(fightId) {
  let wc = document.getElementById('ep-wc-' + fightId).value || null;
  const posType = document.getElementById('ep-pt-' + fightId).value || null;
  const isTitle = document.getElementById('ep-title-' + fightId).checked;
  const isMain = posType === 'Main Event';
  const f1Rank = document.getElementById('ep-f1r-' + fightId).value.trim() || null;
  const f2Rank = document.getElementById('ep-f2r-' + fightId).value.trim() || null;
  const fightNotes = document.getElementById('ep-notes-' + fightId).value.trim() || null;

  const epState = epFighterIds.get(fightId) || {};
  const fightUpdate = {
    weight_class: wc, fight_position_type: posType,
    is_main: isMain, is_title: isTitle,
    fighter1_rank: f1Rank, fighter2_rank: f2Rank, notes: fightNotes
  };
  if (epState.f1Id) fightUpdate.fighter1_id = epState.f1Id;
  if (epState.f2Id) fightUpdate.fighter2_id = epState.f2Id;

  const { error: fightError } = await sb.from('fights').update(fightUpdate).eq('id', fightId);
  if (fightError) { showToast('Error saving fight: ' + fightError.message); return; }

  const winnerId = document.getElementById('ep-winner-' + fightId).value || null;
  const method = document.getElementById('ep-method-' + fightId).value.trim() || null;
  const methodBroad = document.getElementById('ep-mbroad-' + fightId).value || null;
  const round = parseInt(document.getElementById('ep-round-' + fightId).value) || null;
  const time = document.getElementById('ep-time-' + fightId).value.trim() || null;

  const { error: resultError } = await sb.from('fight_results').upsert({
    fight_id: fightId, winner_id: winnerId,
    method, method_broad: methodBroad, round, time
  }, { onConflict: 'fight_id' });
  if (resultError) { showToast('Error saving result: ' + resultError.message); return; }

  showToast('Fight updated');

  if (currentFighter) {
    await reloadFighterFights();
  } else if (currentEvent) {
    const { data } = await sb.from('fight_search').select('*').eq('event_id', currentEvent.id);
    if (data) {
      currentEventFights = data.sort((a, b) => {
        const pa = a.fight_position != null ? a.fight_position : 9999;
        const pb = b.fight_position != null ? b.fight_position : 9999;
        return pa - pb;
      });
      renderEventCard();
    }
  }
}

async function deleteFightFromCard(fightId) {
  if (!confirm('Delete this fight and its result? This cannot be undone.')) return;
  await sb.from('fight_results').delete().eq('fight_id', fightId);
  await sb.from('ratings').delete().eq('fight_id', fightId);
  const { error } = await sb.from('fights').delete().eq('id', fightId);
  if (error) { showToast('Error: ' + error.message); return; }

  myRatings = myRatings.filter(r => r.fight_id !== fightId);
  showToast('Fight deleted');
  if (currentFighter) {
    currentFighterFights = currentFighterFights.filter(f => f.id !== fightId);
    renderFighterCard();
  } else {
    currentEventFights = currentEventFights.filter(f => f.id !== fightId);
    renderEventCard();
  }
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

  // Update local cache — find fight from whichever page is active
  const inEventCtx = currentEventFights.some(f => f.id === fightId);
  const fight = inEventCtx
    ? currentEventFights.find(f => f.id === fightId)
    : currentFighterFights.find(f => f.id === fightId);
  const fullEntry = { ...fight, ...entry };
  const idx = myRatings.findIndex(x => x.fight_id === fightId);
  if (idx >= 0) myRatings[idx] = fullEntry; else myRatings.unshift(fullEntry);

  // Re-render just this fight row to reveal result
  const row = document.getElementById('fight-row-' + fightId);
  if (row) row.outerHTML = renderFightRow(fight, inEventCtx ? {} : { showEvent: true });

  if (currentFighter) updateFighterProgress();
  else updateEventProgress();
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
