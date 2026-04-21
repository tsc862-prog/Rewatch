// ── Event Search + Card ───────────────────────────────────────────────────────


let eventAcIdx = -1, eventAcResults = [];
let recentEventsList = [];
let recentEventsPage = 0;
const RECENT_EVENTS_PAGE_SIZE = 10;

// ── Recent Events List ───────────────────────────────────────────────────────

// Cached data for the recent events list (populated once on load)
let recentEventsUrlCount = {}; // event_id → count of fights with paramount_url
let upcomingEventsList = [];

async function loadRecentEvents() {
  const el = document.getElementById('recent-events');
  if (!el) return;

  // Fetch all event IDs that have at least one result, plus fight-level URL counts
  const { data: fightRows } = await sb
    .from('fight_search')
    .select('event_id,paramount_url')
    .not('method', 'is', null)
    .limit(10000);

  if (!fightRows?.length) { el.style.display = 'none'; return; }

  const idsWithResults = new Set(fightRows.map(f => f.event_id).filter(Boolean));

  // Count fights with a paramount_url per event
  recentEventsUrlCount = {};
  fightRows.forEach(f => {
    if (f.event_id && f.paramount_url) recentEventsUrlCount[f.event_id] = (recentEventsUrlCount[f.event_id] || 0) + 1;
  });

  // Fetch all events then sort client-side — avoids relying on DB text-date ordering
  const { data: allEvents } = await sb.from('events').select('*').limit(5000);
  if (!allEvents?.length) { el.style.display = 'none'; return; }

  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const todayTs = startOfToday.getTime();

  recentEventsList = allEvents
    .filter(e => idsWithResults.has(e.id))
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

  upcomingEventsList = allEvents
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date).getTime();
      return d >= todayTs;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  recentEventsPage = 0;
  renderUpcomingEvents();
  renderRecentEventsList();
}

function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;
  if (!upcomingEventsList.length) { el.style.display = 'none'; return; }

  const todayTs = new Date().setHours(0,0,0,0);

  el.innerHTML = `
    <div class="upcoming-events-label">Upcoming</div>
    ${upcomingEventsList.map((evt, i) => {
      const isToday = new Date(evt.date).setHours(0,0,0,0) === todayTs;
      const urlCount = recentEventsUrlCount[evt.id] || 0;
      return `
        <div class="upcoming-event-row${isToday ? ' today' : ''}" onclick="selectEvent(upcomingEventsList[${i}])">
          <div class="upcoming-event-date-block">
            <div class="upcoming-event-month">${isToday ? 'TODAY' : formatUpcomingMonth(evt.date)}</div>
            <div class="upcoming-event-day">${isToday ? '★' : formatUpcomingDay(evt.date)}</div>
          </div>
          <div class="upcoming-event-info">
            <div class="upcoming-event-name">${escHtml(evt.name)}</div>
            ${evt.location ? `<div class="upcoming-event-meta">${escHtml(evt.location)}</div>` : ''}
            ${evt.paramount_url || urlCount ? `<div class="upcoming-event-links">
              ${evt.paramount_url ? `<a class="recent-event-p" href="${escHtml(evt.paramount_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>` : ''}
              ${urlCount ? `<span class="recent-event-p-count">▶ ${urlCount} fight${urlCount !== 1 ? 's' : ''}</span>` : ''}
            </div>` : ''}
          </div>
          <span class="recent-event-chevron">›</span>
        </div>`;
    }).join('')}`;
  el.style.display = 'block';
}

function formatUpcomingMonth(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
}

function formatUpcomingDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? '' : d.getDate();
}

function renderRecentEventsList() {
  const el = document.getElementById('recent-events');
  if (!el) return;
  if (!recentEventsList.length) { el.style.display = 'none'; return; }

  const total = recentEventsList.length;
  const totalPages = Math.ceil(total / RECENT_EVENTS_PAGE_SIZE);
  const start = recentEventsPage * RECENT_EVENTS_PAGE_SIZE;
  const pageEvents = recentEventsList.slice(start, start + RECENT_EVENTS_PAGE_SIZE);

  const ratedByEvent = {};
  myRatings.forEach(r => { if (r.event_id) ratedByEvent[r.event_id] = (ratedByEvent[r.event_id] || 0) + 1; });

  el.innerHTML = `
    <div class="recent-events-label">Events</div>
    ${pageEvents.map((evt, i) => {
      const globalIdx = start + i;
      const ratedCount = ratedByEvent[evt.id] || 0;
      const urlCount = recentEventsUrlCount[evt.id] || 0;
      return `
        <div class="recent-event-row" onclick="selectEvent(recentEventsList[${globalIdx}])">
          <div class="recent-event-left">
            <div class="recent-event-name">${escHtml(evt.name)}</div>
            <div class="recent-event-meta">
              ${evt.date || '—'}${evt.location ? ' · ' + escHtml(evt.location) : ''}
            </div>
          </div>
          <div class="recent-event-right">
            ${ratedCount ? `<span class="recent-event-rated">${ratedCount} rated</span>` : ''}
            ${evt.paramount_url ? `<a class="recent-event-p" href="${escHtml(evt.paramount_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>` : ''}
            ${urlCount ? `<span class="recent-event-p-count">▶ ${urlCount} fight${urlCount !== 1 ? 's' : ''}</span>` : ''}
            <span class="recent-event-chevron">›</span>
          </div>
        </div>`;
    }).join('')}
    ${totalPages > 1 ? `
    <div class="events-pagination">
      <button class="pag-btn" onclick="recentEventsPageChange(-1)" ${recentEventsPage === 0 ? 'disabled' : ''}>← Prev</button>
      <span class="pag-info">Page ${recentEventsPage + 1} of ${totalPages}</span>
      <button class="pag-btn" onclick="recentEventsPageChange(1)" ${recentEventsPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
    </div>` : ''}`;
  el.style.display = 'block';
}

function recentEventsPageChange(dir) {
  const totalPages = Math.ceil(recentEventsList.length / RECENT_EVENTS_PAGE_SIZE);
  recentEventsPage = Math.max(0, Math.min(totalPages - 1, recentEventsPage + dir));
  renderRecentEventsList();
}
let eventSearchTimer = null;
let currentEvent = null;
let currentEventFights = [];
let eventFightRatings = new Map(); // fightId → { rating }
let savingFights = new Set(); // prevent double-saves

// ── Event Search (inline results) ────────────────────────────────────────────

function eventSearch() {
  clearTimeout(eventSearchTimer);
  const q = document.getElementById('event-search').value.trim();
  if (!q) { renderRecentEventsList(); return; }
  eventSearchTimer = setTimeout(doEventSearch, 300);
}

async function doEventSearch() {
  const q = document.getElementById('event-search').value.trim();
  eventAcIdx = -1;
  if (q.length < 2) { renderRecentEventsList(); return; }

  const { data, error } = await sb
    .from('events')
    .select('*')
    .ilike('name', `%${q}%`)
    .order('date', { ascending: false })
    .limit(10);

  eventAcResults = data || [];
  renderEventSearchResults(q);
}

function renderEventSearchResults(q) {
  const el = document.getElementById('recent-events');
  if (!el) return;
  const data = eventAcResults;
  if (!data.length) {
    el.innerHTML = '<div class="recent-events-label">No events found</div>';
    el.style.display = 'block';
    return;
  }
  const ql = q.toLowerCase();
  const ratedByEvent = {};
  myRatings.forEach(r => { if (r.event_id) ratedByEvent[r.event_id] = (ratedByEvent[r.event_id] || 0) + 1; });
  el.innerHTML = `
    <div class="recent-events-label">Search results</div>
    ${data.map((evt, i) => {
      const ratedCount = ratedByEvent[evt.id] || 0;
      const urlCount = recentEventsUrlCount[evt.id] || 0;
      return `
        <div class="recent-event-row" onclick="eventAcPick(event,${i})">
          <div class="recent-event-left">
            <div class="recent-event-name">${hl(escHtml(evt.name), ql)}</div>
            <div class="recent-event-meta">${evt.date || '—'}${evt.location ? ' · ' + escHtml(evt.location) : ''}</div>
          </div>
          <div class="recent-event-right">
            ${ratedCount ? `<span class="recent-event-rated">${ratedCount} rated</span>` : ''}
            ${evt.paramount_url ? `<a class="recent-event-p" href="${escHtml(evt.paramount_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>` : ''}
            ${urlCount ? `<span class="recent-event-p-count">▶ ${urlCount} fight${urlCount !== 1 ? 's' : ''}</span>` : ''}
            <span class="recent-event-chevron">›</span>
          </div>
        </div>`;
    }).join('')}`;
  el.style.display = 'block';
}

function eventSearchKey(e) {
  const items = document.querySelectorAll('#recent-events .recent-event-row');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); eventAcIdx = Math.min(eventAcIdx+1, items.length-1); items.forEach((el,i) => el.classList.toggle('focused', i===eventAcIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); eventAcIdx = Math.max(0, eventAcIdx-1); items.forEach((el,i) => el.classList.toggle('focused', i===eventAcIdx)); }
  else if (e.key === 'Enter') { if (eventAcIdx >= 0 && eventAcResults[eventAcIdx]) { e.preventDefault(); selectEvent(eventAcResults[eventAcIdx]); } }
  else if (e.key === 'Escape') { document.getElementById('event-search').value = ''; renderRecentEventsList(); }
}

function eventBlur() {}
function eventAcPick(e, i) { selectEvent(eventAcResults[i]); }

// ── Event Card ───────────────────────────────────────────────────────────────

async function selectEvent(evt) {
  currentEvent = evt;
  eventFightRatings.clear();
  document.getElementById('event-search').value = evt.name;
  document.getElementById('recent-events').style.display = 'none';

  const { data, error } = await sb
    .from('fight_search')
    .select('*')
    .eq('event_id', evt.id)
    .order('fight_position', { ascending: true, nullsFirst: false });

  if (error) { showToast('Error loading fights: ' + error.message); return; }

  // Sort by fight_position (nulls last) — mirrors the DB order as a client-side guarantee
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
            <button class="btn btn-outline btn-sm" onclick="closeEvent()">← ${navReturnContext && navReturnContext.type === 'fighter' ? escHtml(navReturnContext.data.name) : 'Back'}</button>
            <span class="event-title">${escHtml(currentEvent.name)}</span>
          </div>
          <div class="event-meta">
            ${currentEvent.date ? `<span>${currentEvent.date}</span>` : ''}
            ${currentEvent.location ? `<span>${currentEvent.location}</span>` : ''}
            ${currentEvent.paramount_url ? `<a class="btn btn-paramount btn-sm" href="${escHtml(currentEvent.paramount_url)}" target="_blank" rel="noopener">▶ Watch on Paramount+</a>` : ''}
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

function getFighterRecord(name, beforeDateStr) {
  const beforeTs = beforeDateStr ? new Date(beforeDateStr).getTime() : Infinity;
  let w = 0, l = 0, d = 0;
  myRatings.forEach(r => {
    const isF1 = r.fighter1_name === name;
    const isF2 = r.fighter2_name === name;
    if (!isF1 && !isF2) return;
    const ts = r.event_date ? new Date(r.event_date).getTime() : null;
    if (!ts || ts >= beforeTs) return;
    if (r.winner_name === name) w++;
    else if (r.winner_name) l++;
    else d++;
  });
  if (w + l + d === 0) return null;
  return `${w}-${l}${d ? '-'+d : ''}`;
}

function renderFightRow(fight, opts) {
  opts = opts || {};
  const rating = myRatings.find(r => r.fight_id === fight.id);
  const isRated = !!(rating && rating.rating);
  const currentVal = isRated ? rating.rating : 0;
  const notes = rating ? (rating.notes || '') : '';
  const f1rec = getFighterRecord(fight.fighter1_name, fight.event_date);
  const f2rec = getFighterRecord(fight.fighter2_name, fight.event_date);

  eventFightRatings.set(fight.id, { rating: currentVal });

  const eventDateStr = fight.event_date || (currentEvent && currentEvent.date) || null;
  const eventDateParsed = eventDateStr ? new Date(eventDateStr) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isFuture = eventDateParsed && !isNaN(eventDateParsed) && eventDateParsed > today;

  const hasVideo = !!(fight.paramount_url || (currentEvent && currentEvent.paramount_url));
  const showResult = !isFuture && (isRated || !hasVideo);

  const resultHtml = showResult
    ? `<div class="fight-row-result revealed">
        ${fight.winner_name ? `<span><strong>W:</strong> ${escHtml(fight.winner_name)}</span>` : '<span>Draw / NC</span>'}
        ${fight.method ? `<span>${escHtml(fight.method)}</span>` : ''}
        ${fight.round ? `<span>R${fight.round}${fight.time ? ' · '+fight.time : ''}</span>` : ''}
        ${fight.details && !fight.details.includes('|') ? `<span class="fight-details">${escHtml(fight.details)}</span>` : ''}
      </div>`
    : `<div class="fight-row-result spoiler">Rate to reveal result</div>`;

  let wlClass = '';
  if (showResult && currentFighter && fight.winner_name) {
    wlClass = fight.winner_name === currentFighter.name ? 'fight-win' : 'fight-loss';
  } else if (showResult && currentFighter && !fight.winner_name) {
    wlClass = 'fight-draw';
  }

  return `
    <div class="fight-row ${isRated ? 'rated' : ''} ${wlClass}" id="fight-row-${fight.id}">
      <div class="fight-row-top">
        <div>
          ${fight.fight_position_type ? '<span class="pos-type-tag pos-'+slugPosType(fight.fight_position_type)+'">'+escHtml(fight.fight_position_type)+'</span> · ' : ''}
          ${fight.is_title ? '<span class="title-tag">TITLE BOUT</span> · ' : ''}
          <span class="fight-row-wc">${escHtml(fight.weight_class || '—')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
        ${isRated ? '<span class="rated-check">✓ rated</span>' : ''}
        ${fight.paramount_url ? `<a class="btn btn-paramount btn-sm" href="${escHtml(fight.paramount_url)}" target="_blank" rel="noopener">▶ Watch</a>` : ''}
      </div>
      </div>
      <div class="fight-row-matchup-line">
        <div class="fight-row-matchup">${fight.fighter1_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter1_rank)+'</span> ' : ''}<button class="nav-link" onclick="navToFighter('${fight.fighter1_id}','${(fight.fighter1_name||'').replace(/'/g,"\\'")}')">${escHtml(fight.fighter1_name)}</button>${fight.fighter1_is_debut ? ' <span class="debut-tag">DEBUT</span>' : ''}${f1rec ? ' <span class="fighter-record">('+f1rec+')</span>' : ''} vs ${fight.fighter2_rank ? '<span class="rank-tag">#'+escHtml(fight.fighter2_rank)+'</span> ' : ''}<button class="nav-link" onclick="navToFighter('${fight.fighter2_id}','${(fight.fighter2_name||'').replace(/'/g,"\\'")}')">${escHtml(fight.fighter2_name)}</button>${fight.fighter2_is_debut ? ' <span class="debut-tag">DEBUT</span>' : ''}${f2rec ? ' <span class="fighter-record">('+f2rec+')</span>' : ''}</div>
        ${isFuture
          ? '<span class="upcoming-tag">Upcoming</span>'
          : `<div class="fight-row-controls">
              <div class="fight-row-stars" id="stars-${fight.id}" onmouseleave="hoverFightStars('${fight.id}',0)">${buildClickableStars(fight.id, currentVal, 17)}</div>
            </div>
            <div id="result-${fight.id}" class="fight-row-result-wrap">${resultHtml}</div>`}
      </div>
      ${opts.showEvent && fight.event_name ? '<div class="fight-row-event-meta"><button class="nav-link" onclick="navToEvent(\''+fight.event_id+'\')">'+escHtml(fight.event_name)+'</button>'+(fight.event_date?' · '+fight.event_date:'')+'</div>' : ''}
      ${fight.notes ? '<div class="fight-row-notes-info">'+escHtml(fight.notes)+'</div>' : ''}
      ${!isFuture ? `<input class="fight-row-notes" id="notes-${fight.id}" type="text" placeholder="Notes…" value="${escHtml(notes)}"
        onblur="saveNotes('${fight.id}')">` : ''}
    </div>`;
}


function closeEvent() {
  if (navReturnContext && navReturnContext.type === 'fighter') {
    const ctx = navReturnContext;
    navReturnContext = null;
    currentEvent = null;
    currentEventFights = [];
    eventFightRatings.clear();
    activateView('view-fighter', 'Fighter');
    selectFighterForPage(ctx.data);
    return;
  }
  document.getElementById('event-card').style.display = 'none';
  document.getElementById('event-search-card').style.display = 'block';
  document.getElementById('event-search').value = '';
  currentEvent = null;
  currentEventFights = [];
  eventFightRatings.clear();
  navReturnContext = null;
  renderUpcomingEvents();
  renderRecentEventsList();
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
    s.innerHTML = starSVG(d >= i ? 'full' : d >= i - 0.5 ? 'half' : 'empty', 17);
  });
  const lbl = document.getElementById('star-lbl-' + fightId);
  if (lbl) lbl.textContent = d ? d + '/5' : '—';
}

function setFightRating(fightId, val) {
  if (!requireAuth('rate fights')) { hoverFightStars(fightId, 0); return; }
  if (!eventFightRatings.has(fightId)) {
    eventFightRatings.set(fightId, { rating: 0 });
  }
  eventFightRatings.get(fightId).rating = val;
  hoverFightStars(fightId, val);
  // Auto-save
  saveFightRating(fightId);
}

function expandNoteShorthands(text, fightId) {
  const fight = currentEventFights.find(f => f.id === fightId) || currentFighterFights.find(f => f.id === fightId);
  if (!fight) return text;
  return text
    .replace(/\bF1\b/g, fight.fighter1_name || 'F1')
    .replace(/\bF2\b/g, fight.fighter2_name || 'F2');
}

// ── Auto-Save ────────────────────────────────────────────────────────────────

async function saveFightRating(fightId) {
  const state = eventFightRatings.get(fightId);
  if (!state || !state.rating) return;
  if (savingFights.has(fightId)) return; // prevent double-save
  savingFights.add(fightId);

  const notesEl = document.getElementById('notes-' + fightId);
  const notesRaw = notesEl ? notesEl.value.trim() : '';
  const notesVal = expandNoteShorthands(notesRaw, fightId);
  if (notesEl && notesVal !== notesRaw) notesEl.value = notesVal;

  const entry = {
    fight_id:  fightId,
    user_id:   currentUser.id,
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
  loadFightAggregates();
}

// Save notes on blur — delayed slightly so star clicks register first
async function saveNotes(fightId) {
  await new Promise(r => setTimeout(r, 150));
  if (savingFights.has(fightId)) return;

  const notesEl = document.getElementById('notes-' + fightId);
  const notesRaw = notesEl ? notesEl.value.trim() : '';
  const notesVal = expandNoteShorthands(notesRaw, fightId);
  if (notesEl && notesVal !== notesRaw) notesEl.value = notesVal;
  if (!notesVal && !myRatings.find(x => x.fight_id === fightId)) return;

  const existing = myRatings.find(x => x.fight_id === fightId);
  if (existing && (existing.notes || '') === notesVal) return;

  let error;
  if (existing) {
    ({ error } = await sb.from('ratings').update({ notes: notesVal || null }).eq('fight_id', fightId));
    if (!error) existing.notes = notesVal || null;
  } else {
    if (!currentUser) return;
    const fight = currentEventFights.find(f => f.id === fightId) || currentFighterFights.find(f => f.id === fightId);
    const entry = { fight_id: fightId, user_id: currentUser.id, rating: null, notes: notesVal, logged_at: Date.now() };
    ({ error } = await sb.from('ratings').insert(entry));
    if (!error) myRatings.unshift({ ...fight, ...entry });
  }

  if (error) { showToast('Error saving notes'); return; }
  showToast('Notes saved');
}
