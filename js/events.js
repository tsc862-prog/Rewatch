// ── Event Search + Card ───────────────────────────────────────────────────────


// Parse a bare "YYYY-MM-DD" event date as LOCAL midnight. Using `new Date(str)`
// on a date-only string parses it as UTC midnight, which in negative-offset
// timezones (the Americas) lands before the user's local midnight — that made
// today's events fail the `>= todayTs` upcoming filter and disappear entirely.
function eventDateTs(dateStr) {
  if (!dateStr) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0); return d.getTime();
}

let eventAcIdx = -1, eventAcResults = [];
let recentEventsList = [];
let recentEventsView = [];   // recentEventsList after the org filter (referenced by row onclick)
let upcomingEventsView = []; // upcomingEventsList after the org filter
let recentEventsPage = 0;
const RECENT_EVENTS_PAGE_SIZE = 10;

// ── Events org filter ─────────────────────────────────────────────────────────
function eventsOrg() { return document.getElementById('events-org')?.value || ''; }
function filterEventsByOrg(list) {
  const o = eventsOrg();
  return o ? list.filter(e => e.organization === o) : list;
}
function eventsOrgChange() {
  recentEventsPage = 0;
  populateEventsYears(); // year options follow the selected org
  updateUpcomingTabCount();
  renderActiveEventsTab();
}

// ── Events / Upcoming tabs ───────────────────────────────────────────────────
let eventsTab = 'past';

function switchEventsTab(tab) {
  eventsTab = tab;
  document.getElementById('events-tab-past').classList.toggle('active', tab === 'past');
  document.getElementById('events-tab-upcoming').classList.toggle('active', tab === 'upcoming');
  // Year + sort only apply to the past-events list
  document.getElementById('events-year-group').style.display = tab === 'past' ? '' : 'none';
  document.getElementById('events-sort-group').style.display = tab === 'past' ? '' : 'none';
  const search = document.getElementById('event-search');
  if (search && search.value) search.value = ''; // search results render into the past list
  renderActiveEventsTab();
}

function renderActiveEventsTab() {
  const past = document.getElementById('recent-events');
  const upcoming = document.getElementById('upcoming-events');
  if (!past || !upcoming) return;
  if (eventsTab === 'upcoming') {
    past.style.display = 'none';
    renderUpcomingEvents();
  } else {
    upcoming.style.display = 'none';
    renderRecentEventsList();
  }
}

function updateUpcomingTabCount() {
  const badge = document.getElementById('upcoming-tab-count');
  if (!badge) return;
  const n = filterEventsByOrg(upcomingEventsList).length;
  badge.textContent = n;
  badge.style.display = n ? '' : 'none';
}

// ── Events year filter + sort ────────────────────────────────────────────────
function eventsYear() { return document.getElementById('events-year')?.value || ''; }
function eventsSortDir() { return document.getElementById('events-sort')?.value || 'newest'; }

function eventsFilterChange() {
  recentEventsPage = 0;
  renderRecentEventsList();
}

// Org filter → year filter → sort direction, applied to the Events list.
// recentEventsList is kept newest-first, so "oldest" is just a reversed copy.
function filterAndSortRecentEvents() {
  let list = filterEventsByOrg(recentEventsList);
  const y = eventsYear();
  if (y) list = list.filter(e => (e.date || '').startsWith(y));
  if (eventsSortDir() === 'oldest') list = list.slice().reverse();
  return list;
}

// Populate the year dropdown from events matching the current org filter.
function populateEventsYears() {
  const sel = document.getElementById('events-year');
  if (!sel) return;
  const cur = sel.value;
  const years = [...new Set(
    filterEventsByOrg(recentEventsList)
      .map(e => (e.date || '').slice(0, 4))
      .filter(y => /^\d{4}$/.test(y))
  )].sort((a, b) => b - a);
  sel.innerHTML = '<option value="">All years</option>' + years.map(y => `<option>${y}</option>`).join('');
  if (cur && years.includes(cur)) sel.value = cur;
}
// Populate the org dropdown from the loaded events (UFC first, then alphabetical).
function populateEventsOrgs(events) {
  const sel = document.getElementById('events-org');
  if (!sel) return;
  const cur = sel.value;
  const orgs = [...new Set(events.map(e => e.organization).filter(Boolean))].sort(byOrgName);
  sel.innerHTML = '<option value="">All orgs</option>' + orgs.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
  if (cur && orgs.includes(cur)) sel.value = cur;
}

// ── Recent Events List ───────────────────────────────────────────────────────

// Cached data for the recent events list (populated once on load)
let upcomingEventsList = [];
let eventsWithFightVideo = new Set(); // event IDs with at least one fight-level video link

// True if the event has a video link at event level or on any of its fights
function hasAnyVideo(evt) {
  return eventHasVideo(evt) || (evt && eventsWithFightVideo.has(evt.id));
}

async function loadRecentEvents() {
  const el = document.getElementById('recent-events');
  if (!el) return;
  // Every event row is paged down on first load — show progress rather than an
  // empty search card
  el.innerHTML = loadingHtml('Loading events…');
  el.style.display = 'block';

  // Which events have results (+ a fight-level video link). Uses an aggregate RPC so we
  // get every event in one small payload — a row-capped fight_search scan silently dropped
  // the newest events once the dataset grew past the limit.
  const { data: flags } = await sb.rpc('event_result_flags');
  if (!flags?.length) { el.style.display = 'none'; return; }

  const idsWithResults = new Set(flags.map(f => f.event_id));
  eventsWithFightVideo = new Set(flags.filter(f => f.has_video).map(f => f.event_id));

  // Fetch all events in pages, then sort client-side — a single row-capped select
  // silently dropped whichever rows fell past the cap once the table outgrew it
  // (upcoming events vanished while search, which queries the DB, still found them).
  const allEvents = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await sb.from('events').select('*').order('id').range(from, from + PAGE - 1);
    if (page?.length) allEvents.push(...page);
    if (!page || page.length < PAGE) break;
  }
  if (!allEvents.length) { el.style.display = 'none'; return; }
  auditOrgLogos(allEvents);

  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const todayTs = startOfToday.getTime();

  recentEventsList = allEvents
    .filter(e => idsWithResults.has(e.id))
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return (db - da) || (b.id - a.id); // deterministic tie-break for same-date events
    });

  upcomingEventsList = allEvents
    .filter(e => e.date && eventDateTs(e.date) >= todayTs)
    .sort((a, b) => eventDateTs(a.date) - eventDateTs(b.date));

  recentEventsPage = 0;
  populateEventsOrgs(allEvents);
  populateEventsYears();
  updateUpcomingTabCount();
  renderActiveEventsTab();
}

function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;
  upcomingEventsView = filterEventsByOrg(upcomingEventsList);

  const todayTs = new Date().setHours(0,0,0,0);

  el.innerHTML = upcomingEventsView.length
    ? upcomingEventsView.map((evt, i) => {
      const isToday = eventDateTs(evt.date) === todayTs;
      return `
        <div class="upcoming-event-row${isToday ? ' today' : ''}" onclick="selectEvent(upcomingEventsView[${i}])">
          <div class="upcoming-event-date-block">
            <div class="upcoming-event-month">${isToday ? 'TODAY' : formatUpcomingMonth(evt.date)}</div>
            <div class="upcoming-event-day">${isToday ? '★' : formatUpcomingDay(evt.date)}</div>
          </div>
          <div class="upcoming-event-info">
            <div class="upcoming-event-name">${orgBadge(evt.organization)}${escHtml(evt.name)}</div>
            ${evt.location ? `<div class="upcoming-event-meta">${escHtml(evt.location)}</div>` : ''}
          </div>
          <span class="recent-event-chevron">›</span>
        </div>`;
    }).join('')
    : '<div class="empty" style="padding:12px 0">No upcoming events match these filters.</div>';
  el.style.display = 'block';
}

// Both parse via eventDateTs (local midnight) — new Date('YYYY-MM-DD') is UTC
// midnight, which shifts the shown day back by one in negative-offset timezones
function formatUpcomingMonth(dateStr) {
  const ts = eventDateTs(dateStr);
  return isNaN(ts) ? '' : new Date(ts).toLocaleString('en-US', { month: 'short' }).toUpperCase();
}

function formatUpcomingDay(dateStr) {
  const ts = eventDateTs(dateStr);
  return isNaN(ts) ? '' : new Date(ts).getDate();
}

function renderRecentEventsList() {
  const el = document.getElementById('recent-events');
  if (!el) return;
  if (!recentEventsList.length) { el.style.display = 'none'; return; }

  recentEventsView = filterAndSortRecentEvents();
  const total = recentEventsView.length;
  const totalPages = Math.max(1, Math.ceil(total / RECENT_EVENTS_PAGE_SIZE));
  if (recentEventsPage > totalPages - 1) recentEventsPage = totalPages - 1;
  const start = recentEventsPage * RECENT_EVENTS_PAGE_SIZE;
  const pageEvents = recentEventsView.slice(start, start + RECENT_EVENTS_PAGE_SIZE);

  if (!total) {
    el.innerHTML = '<div class="empty" style="padding:12px 0">No events match these filters.</div>';
    el.style.display = 'block';
    return;
  }

  const ratedByEvent = {};
  myRatings.forEach(r => { if (r.event_id) ratedByEvent[r.event_id] = (ratedByEvent[r.event_id] || 0) + 1; });

  el.innerHTML = `
    ${pageEvents.map((evt, i) => {
      const globalIdx = start + i;
      const ratedCount = ratedByEvent[evt.id] || 0;
      return `
        <div class="recent-event-row" onclick="selectEvent(recentEventsView[${globalIdx}])">
          <div class="recent-event-left">
            <div class="recent-event-name">${orgBadge(evt.organization)}${escHtml(evt.name)}</div>
            <div class="recent-event-meta">
              ${formatEventDate(evt.date) || '—'}${evt.location ? ' · ' + escHtml(evt.location) : ''}
            </div>
          </div>
          <div class="recent-event-right">
            ${hasAnyVideo(evt) ? '<span class="video-dot" title="Video available">▶</span>' : ''}
            ${ratedCount ? `<span class="recent-event-rated">${ratedCount} rated</span>` : ''}
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
  const totalPages = Math.ceil(recentEventsView.length / RECENT_EVENTS_PAGE_SIZE);
  recentEventsPage = Math.max(0, Math.min(totalPages - 1, recentEventsPage + dir));
  renderRecentEventsList();
}
let eventSearchTimer = null;
let currentEvent = null;
let currentEventFights = [];
let eventFightRatings = new Map(); // fightId → { rating }
const ratingSaveQueues = new Map(); // one serialized queue per user and fight

// ── Event Search (inline results) ────────────────────────────────────────────

function eventSearch() {
  clearTimeout(eventSearchTimer);
  const q = document.getElementById('event-search').value.trim();
  if (!q) { renderActiveEventsTab(); return; }
  eventSearchTimer = setTimeout(doEventSearch, 300);
}

async function doEventSearch() {
  const q = document.getElementById('event-search').value.trim();
  eventAcIdx = -1;
  if (q.length < 2) { renderActiveEventsTab(); return; }

  const listEl = document.getElementById('recent-events');
  if (listEl) { listEl.innerHTML = loadingHtml('Searching…'); listEl.style.display = 'block'; }
  const { data, error } = await sb
    .from('events')
    .select('*')
    .ilike('name', `%${q}%`)
    .order('date', { ascending: false })
    .limit(10);

  // A newer keystroke may have already re-rendered the list; don't paint stale results over it
  if (document.getElementById('event-search').value.trim() !== q) return;
  eventAcResults = data || [];
  renderEventSearchResults(q);
}

function renderEventSearchResults(q) {
  const el = document.getElementById('recent-events');
  if (!el) return;
  // Results render into the past-events container regardless of the active tab
  const upcoming = document.getElementById('upcoming-events');
  if (upcoming) upcoming.style.display = 'none';
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
      return `
        <div class="recent-event-row" onclick="eventAcPick(event,${i})">
          <div class="recent-event-left">
            <div class="recent-event-name">${orgBadge(evt.organization)}${hl(escHtml(evt.name), ql)}</div>
            <div class="recent-event-meta">${formatEventDate(evt.date) || '—'}${evt.location ? ' · ' + escHtml(evt.location) : ''}</div>
          </div>
          <div class="recent-event-right">
            ${hasAnyVideo(evt) ? '<span class="video-dot" title="Video available">▶</span>' : ''}
            ${ratedCount ? `<span class="recent-event-rated">${ratedCount} rated</span>` : ''}
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
  else if (e.key === 'Escape') { document.getElementById('event-search').value = ''; renderActiveEventsTab(); }
}

function eventBlur() {}
function eventAcPick(e, i) { selectEvent(eventAcResults[i]); }

// ── Event Card ───────────────────────────────────────────────────────────────

async function selectEvent(evt) {
  currentEvent = evt;
  eventFightRatings.clear();
  document.getElementById('event-search').value = evt.name;
  document.getElementById('recent-events').style.display = 'none';
  showCardLoading('event-card', 'event-search-card', `Loading ${evt.name}…`);

  const { data, error } = await sb
    .from('fight_search')
    .select('*')
    .not('is_amateur', 'is', true)
    .eq('event_id', evt.id)
    .order('fight_position', { ascending: true, nullsFirst: false });

  if (currentEvent !== evt) return; // the user opened something else meanwhile
  if (error) {
    restoreCardSearch('event-card', 'event-search-card');
    document.getElementById('recent-events').style.display = 'block';
    showToast('Error loading fights: ' + error.message);
    return;
  }

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
            <span class="event-title">${orgBadge(currentEvent.organization)}${escHtml(currentEvent.name)}</span>
          </div>
          <div class="event-meta">
            ${currentEvent.date ? `<span>${formatEventDate(currentEvent.date)}</span>` : ''}
            ${currentEvent.location ? `<span>${currentEvent.location}</span>` : ''}
            ${eventWatchBtn(currentEvent)}
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

  // Mirror of renderFighterCard: clear the fighter card's DOM so fight-row
  // element ids stay unique. showView re-renders it from currentFighter.
  const fc = document.getElementById('fighter-card');
  if (fc) { fc.innerHTML = ''; fc.style.display = 'none'; }
  const fsc = document.getElementById('fighter-search-card');
  if (fsc) fsc.style.display = 'block';
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
  eventFightRatings.set(fight.id, { rating: currentVal });

  const eventDateStr = fight.event_date || (currentEvent && currentEvent.date) || null;
  const eventTs = eventDateStr ? eventDateTs(eventDateStr) : NaN;
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const isFuture = !isNaN(eventTs) && eventTs > todayTs;
  const isToday = eventTs === todayTs;

  // The fight's own VOD or, failing that, the event replay carried on the
  // fight_search row (fightWatchLinks). Either one is watchable, so either one
  // hides the result until the fight is rated — on the fighter card too, which
  // used to reveal results for fights that only had a full-event replay.
  // An event dated today is treated the same whether or not it has links yet:
  // the card is airing (or about to), so its results are spoilers until rated.
  // That also stops half-scraped rows from reading "Draw / NC" mid-show.
  const watchLinks = fightWatchLinks(fight);
  const hasVideo = watchLinks.length > 0;
  const showResult = !isFuture && (isRated || !(hasVideo || isToday));

  // Display order while the result is hidden. Sherdog lists the winner first,
  // so fighter1 can't be trusted as-is. If either fighter carries a rank the
  // champion / better-ranked one leads (a rank says nothing about the outcome);
  // otherwise shuffle deterministically per fight id so position leaks nothing.
  const swapOrder = !showResult && (
    (fight.fighter1_rank || fight.fighter2_rank)
      ? rankOrder(fight.fighter2_rank) < rankOrder(fight.fighter1_rank)
      : !!fight.id && (fight.id.charCodeAt(0) + fight.id.charCodeAt(fight.id.length - 1)) % 2 === 1);
  const dF1 = swapOrder ? fight.fighter2_name : fight.fighter1_name;
  const dF2 = swapOrder ? fight.fighter1_name : fight.fighter2_name;
  const dF1id = swapOrder ? fight.fighter2_id : fight.fighter1_id;
  const dF2id = swapOrder ? fight.fighter1_id : fight.fighter2_id;
  const dF1rank = swapOrder ? fight.fighter2_rank : fight.fighter1_rank;
  const dF2rank = swapOrder ? fight.fighter1_rank : fight.fighter2_rank;
  const dF1debut = swapOrder ? fight.fighter2_is_debut : fight.fighter1_is_debut;
  const dF2debut = swapOrder ? fight.fighter1_is_debut : fight.fighter2_is_debut;
  const f1rec = getFighterRecord(dF1, fight.event_date);
  const f2rec = getFighterRecord(dF2, fight.event_date);

  // On the fighter card every row would start with the profile fighter's own
  // name, pushing the opponent — the only informative name — into the
  // ellipsis. When the perspective matches one side, render "vs Opponent"
  // instead. A name mismatch (data quirk) falls back to the full matchup.
  const opp = opts.perspective === fight.fighter1_name
    ? { name: fight.fighter2_name, id: fight.fighter2_id, rank: fight.fighter2_rank, debut: fight.fighter2_is_debut }
    : opts.perspective === fight.fighter2_name
      ? { name: fight.fighter1_name, id: fight.fighter1_id, rank: fight.fighter1_rank, debut: fight.fighter1_is_debut }
      : null;
  const oppRec = opp ? getFighterRecord(opp.name, fight.event_date) : null;

  const resultHtml = showResult
    ? `<div class="fight-row-result revealed${opp && fight.winner_name ? (fight.winner_name === opts.perspective ? ' result-win' : ' result-loss') : ''}">
        ${fight.winner_name
          ? (opp
              ? (fight.winner_name === opts.perspective ? '<span><strong>Win</strong></span>' : '<span><strong>Loss</strong></span>')
              : `<span><strong>W:</strong> ${escHtml(fight.winner_name)}</span>`)
          : '<span>Draw / NC</span>'}
        ${fight.method ? `<span>${escHtml(fight.method)}</span>` : ''}
        ${fight.round ? `<span>R${fight.round}${fight.time ? ' · '+fight.time : ''}</span>` : ''}
        ${fight.details && !fight.details.includes('|') ? `<span class="fight-details">${escHtml(fight.details)}</span>` : ''}
      </div>`
    : `<div class="fight-row-result spoiler">Rate to reveal result</div>`;

  // Win/loss coloring is relative to a named fighter and only wanted on the
  // fighter card — keying it off the currentFighter global colored event-card
  // rows against whichever fighter was viewed last
  let wlClass = '';
  if (showResult && opts.perspective) {
    wlClass = !fight.winner_name ? 'fight-draw'
      : fight.winner_name === opts.perspective ? 'fight-win' : 'fight-loss';
  }

  return `
    <div class="fight-row ${isRated ? 'rated' : ''} ${wlClass}" id="fight-row-${fight.id}">
      <div class="fight-row-single">
        <div class="fight-row-matchup">${opp
          ? `<span class="vs-prefix">vs</span> ${rankTag(opp.rank)}<button class="nav-link" onclick="navToFighter('${opp.id}','${(opp.name||'').replace(/'/g,"\\'")}')">${escHtml(opp.name)}</button>${opp.debut ? ' <span class="debut-tag">DEBUT</span>' : ''}${oppRec ? ' <span class="fighter-record">('+oppRec+')</span>' : ''}`
          : `${rankTag(dF1rank)}<button class="nav-link" onclick="navToFighter('${dF1id}','${(dF1||'').replace(/'/g,"\\'")}')">${escHtml(dF1)}</button>${dF1debut ? ' <span class="debut-tag">DEBUT</span>' : ''}${f1rec ? ' <span class="fighter-record">('+f1rec+')</span>' : ''} vs ${rankTag(dF2rank)}<button class="nav-link" onclick="navToFighter('${dF2id}','${(dF2||'').replace(/'/g,"\\'")}')">${escHtml(dF2)}</button>${dF2debut ? ' <span class="debut-tag">DEBUT</span>' : ''}${f2rec ? ' <span class="fighter-record">('+f2rec+')</span>' : ''}`}</div>
        ${isFuture
          ? '<span class="upcoming-tag">Upcoming</span>'
          : `<div class="fight-row-stars" id="stars-${fight.id}" onmouseleave="hoverFightStars('${fight.id}',0)">${buildClickableStars(fight.id, currentVal, 17)}</div>
             <div id="result-${fight.id}" class="fight-row-result-wrap">${resultHtml}</div>`}
        <div class="watch-icons">${watchLinks.map(watchIconHtml).join('')}</div>
      </div>
      <div class="fight-row-submeta">
        ${fight.fight_position_type ? '<span class="pos-type-tag pos-'+slugPosType(fight.fight_position_type)+'">'+escHtml(fight.fight_position_type)+'</span>' : ''}
        ${fight.is_title ? '<span class="title-tag">TITLE BOUT</span>' : ''}
        <span class="fight-row-wc">${escHtml(fight.weight_class || '—')}</span>
        ${opts.showEvent && fight.event_name ? '<span class="submeta-sep">·</span><button class="nav-link" onclick="navToEvent(\''+fight.event_id+'\')">'+escHtml(fight.event_name)+'</button>'+(fight.event_date?'<span class="submeta-sep">·</span>'+formatEventDate(fight.event_date):'') : ''}
      </div>
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
    activateView('view-fighter');
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
  renderActiveEventsTab();
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

function saveFightRating(fightId) {
  const state = eventFightRatings.get(fightId);
  if (!currentUser || !state?.rating) return Promise.resolve();
  return queueRatingSave(fightId, { rating: state.rating, logged_at: Date.now() });
}

function saveNotes(fightId) {
  if (!currentUser) return Promise.resolve();
  return queueRatingSave(fightId, {});
}

// Capture edits before awaiting a request or replacing any row markup.
function queueRatingSave(fightId, patch) {
  const userId = currentUser.id;
  const key = userId + ':' + fightId;
  const notesEl = document.getElementById('notes-' + fightId);
  if (notesEl) {
    const notes = expandNoteShorthands(notesEl.value.trim(), fightId);
    notesEl.value = notes;
    patch = { ...patch, notes: notes || null };
  }
  let queue = ratingSaveQueues.get(key);
  if (!queue) {
    queue = { pending: null, running: null };
    ratingSaveQueues.set(key, queue);
  }
  queue.pending = { ...queue.pending, ...patch };
  if (!queue.running) {
    // Defer starting until running is assigned, including immediate failures.
    queue.running = Promise.resolve().then(() => drainRatingSaves(key, queue, fightId, userId));
  }
  return queue.running;
}

async function drainRatingSaves(key, queue, fightId, userId) {
  try {
    while (queue.pending) {
      if (currentUser?.id !== userId) { queue.pending = null; break; }
      const patch = queue.pending;
      queue.pending = null;
      try {
        const { data, error } = await sb.from('ratings').upsert(
          { fight_id: fightId, user_id: userId, ...patch },
          { onConflict: 'user_id,fight_id' }
        ).select().single();
        if (error) throw error;
        if (currentUser?.id !== userId) { queue.pending = null; break; }
        const fight = currentEventFights.find(f => f.id === fightId)
          || currentFighterFights.find(f => f.id === fightId);
        const idx = myRatings.findIndex(r => r.fight_id === fightId);
        const saved = { ...(idx >= 0 ? myRatings[idx] : fight), ...data };
        if (idx >= 0) myRatings[idx] = saved; else myRatings.unshift(saved);
        if (!queue.pending) {
          const row = document.getElementById('fight-row-' + fightId);
          const notes = document.getElementById('notes-' + fightId);
          // Do not destroy a note draft typed while this request was running.
          const editing = notes && (document.activeElement === notes
            || expandNoteShorthands(notes.value.trim(), fightId) !== (data.notes || ''));
          if (row && fight && !editing) {
            const inFighterCard = !!row.closest('#fighter-card');
            row.outerHTML = renderFightRow(fight, inFighterCard
              ? { showEvent: true, perspective: currentFighter?.name } : {});
          }
          updateFighterProgress();
          updateEventProgress();
          showToast('Saved');
          loadFightAggregates();
        }
      } catch (error) {
        // Retain the failed patch; a subsequent edit retries it with latest values.
        queue.pending = { ...patch, ...queue.pending };
        showToast('Save failed. Change the rating or notes to retry: ' + error.message);
        break;
      }
    }
  } finally {
    queue.running = null;
    if (!queue.pending) ratingSaveQueues.delete(key);
  }
}
