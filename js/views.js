// ── Views & Rendering ─────────────────────────────────────────────────────────

let tableSortCol = 'date';
let tableSortAsc = false; // default: most recent first

function sortTable(col) {
  if (tableSortCol === col) {
    tableSortAsc = !tableSortAsc;
  } else {
    tableSortCol = col;
    tableSortAsc = col === 'fighter1' || col === 'fighter2' || col === 'event' || col === 'division' || col === 'method';
  }
  updateSortIndicators();
  renderTable();
}

function updateSortIndicators() {
  document.querySelectorAll('#view-fights th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
  const cols = ['fighter1','fighter2','event','date','division','method','round','rating'];
  const idx = cols.indexOf(tableSortCol);
  if (idx >= 0) {
    const th = document.querySelectorAll('#view-fights th.sortable')[idx];
    if (th) th.classList.add(tableSortAsc ? 'sort-asc' : 'sort-desc');
  }
}

function showView(v, e) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  if (e && e.target) e.target.classList.add('active');
  if (v === 'fights') renderTable();
  if (v === 'dashboard') renderDashboard();
  if (v === 'community') openCommunityDashboard();
}

function methodBadge(m) {
  if (!m) return '—';
  const ml = m.toLowerCase();
  if (ml.includes('ko') || ml.includes('tko')) return `<span class="badge b-ko">${escHtml(m)}</span>`;
  if (ml.includes('submission')) return `<span class="badge b-sub">${escHtml(m)}</span>`;
  if (ml.includes('decision')) return `<span class="badge b-dec">${escHtml(m)}</span>`;
  return `<span class="badge b-nc">${escHtml(m)}</span>`;
}

function renderTable() {
  const q    = (document.getElementById('search').value||'').toLowerCase();
  const wc   = document.getElementById('filter-wc').value;
  const meth = document.getElementById('filter-method').value;
  const filtered = myRatings.filter(f => {
    const txt = ((f.fighter1_name||'')+' '+(f.fighter2_name||'')+' '+(f.event_name||'')).toLowerCase();
    const ml = (f.method||'').toLowerCase();
    const mMatch = !meth || (meth==='KO/TKO'&&(ml.includes('ko')||ml.includes('tko'))) || (meth==='Submission'&&ml.includes('submission')) || (meth==='Decision'&&ml.includes('decision'));
    return (!q||txt.includes(q)) && (!wc||f.weight_class===wc) && mMatch;
  });
  // Sort
  const dir = tableSortAsc ? 1 : -1;
  filtered.sort((a, b) => {
    let va, vb;
    switch (tableSortCol) {
      case 'fighter1': va = (a.fighter1_name||'').toLowerCase(); vb = (b.fighter1_name||'').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0;
      case 'fighter2': va = (a.fighter2_name||'').toLowerCase(); vb = (b.fighter2_name||'').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0;
      case 'event': va = (a.event_name||'').toLowerCase(); vb = (b.event_name||'').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0;
      case 'date': va = a.event_date ? new Date(a.event_date).getTime() : 0; vb = b.event_date ? new Date(b.event_date).getTime() : 0; return (va - vb) * dir;
      case 'division': va = (a.weight_class||'').toLowerCase(); vb = (b.weight_class||'').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0;
      case 'method': va = (a.method||'').toLowerCase(); vb = (b.method||'').toLowerCase(); return va < vb ? -dir : va > vb ? dir : 0;
      case 'round': va = (a.round||0) * 600 + (a.time ? parseInt(a.time) * 60 + parseInt((a.time.split(':')[1])||0) : 0); vb = (b.round||0) * 600 + (b.time ? parseInt(b.time) * 60 + parseInt((b.time.split(':')[1])||0) : 0); return (va - vb) * dir;
      case 'rating': va = a.rating || 0; vb = b.rating || 0; return (va - vb) * dir;
      default: return 0;
    }
  });

  const tbody = document.getElementById('fight-tbody');
  const empty = document.getElementById('table-empty');
  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.textContent = currentUser
      ? 'No fights rated yet — head to "Rate event" to get started.'
      : 'Log in to see your ratings.';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(f => {
    const hasNotes = !!f.notes;
    return `<tr class="ratings-row${hasNotes ? ' has-notes' : ''}">
      <td title="${f.fighter1_name||''}"><button class="nav-link" onclick="navToFighter('${f.fighter1_id}','${(f.fighter1_name||'').replace(/'/g,"\\'")}')">${f.fighter1_name||''}</button>${f.winner_name===f.fighter1_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
      <td title="${f.fighter2_name||''}"><button class="nav-link" onclick="navToFighter('${f.fighter2_id}','${(f.fighter2_name||'').replace(/'/g,"\\'")}')">${f.fighter2_name||''}</button>${f.winner_name===f.fighter2_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
      <td title="${f.event_name||''}">${orgBadge(f.event_organization)}<button class="nav-link" onclick="navToEvent('${f.event_id}')">${f.event_name||'—'}</button></td>
      <td>${f.event_date||'—'}</td>
      <td title="${f.weight_class||''}">${f.weight_class||'—'}${f.is_title?' <span class="title-tag">🏆</span>':''}</td>
      <td>${methodBadge(f.method)}</td>
      <td>${f.round?'R'+f.round+(f.time?' '+f.time:''):f.time||'—'}</td>
      <td><span style="display:inline-flex;gap:1px;vertical-align:middle">${f.rating?buildStars(f.rating,13):'—'}</span></td>
      <td><button class="btn-danger" onclick="deleteRating('${f.fight_id}')">Del</button></td>
    </tr>
    ${hasNotes ? `<tr class="notes-sub-row"><td colspan="9"><div class="notes-sub-content">${escHtml(f.notes)}</div></td></tr>` : ''}`;
  }).join('');
}


// ── Dashboard ─────────────────────────────────────────────────────────────────

function calcTotalFightTime() {
  let totalSec = 0;
  filterDashYear(myRatings).forEach(f => {
    if (!f.round) return;
    if (f.time) {
      const parts = f.time.split(':').map(Number);
      const min = parts[0] || 0, sec = parts[1] || 0;
      totalSec += (f.round - 1) * 5 * 60 + min * 60 + sec;
    } else {
      totalSec += f.round * 5 * 60; // no time = assume full rounds
    }
  });
  return totalSec;
}

function formatFightTime(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ── Dashboard year filter (applies to the whole personal dashboard) ───────────
function dashYear() { return document.getElementById('dashboard-year')?.value || ''; }
function filterDashYear(list) {
  const y = dashYear();
  return y ? list.filter(f => (f.event_date || '').slice(0, 4) === y) : list;
}
function populateDashYears() {
  const sel = document.getElementById('dashboard-year');
  if (!sel) return;
  const cur = sel.value;
  const years = [...new Set(myRatings.map(f => (f.event_date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (cur && years.includes(cur)) sel.value = cur;
}

function renderDashboard() {
  populateDashYears();
  const fights = filterDashYear(myRatings);
  document.getElementById('d-total').textContent = fights.length;
  document.getElementById('d-events').textContent = new Set(fights.map(f=>f.event_name).filter(Boolean)).size;
  document.getElementById('d-finishes').textContent = fights.filter(f=>{ const ml=(f.method||'').toLowerCase(); return ml.includes('ko')||ml.includes('tko')||ml.includes('submission'); }).length;
  const rated = fights.filter(f => f.rating);
  const avg   = rated.length ? rated.reduce((a,b)=>a+Number(b.rating),0)/rated.length : null;
  document.getElementById('d-avg').innerHTML = avg ? `${avg.toFixed(1)} <span style="color:#E24B4A;font-size:20px">★</span>` : '—';
  document.getElementById('d-time').textContent = formatFightTime(calcTotalFightTime());
  renderMethodChart();
  renderWcBars();
  renderLeaderboard();
  renderActivityFeed();
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

async function renderActivityFeed() {
  const el = document.getElementById('activity-feed');
  if (!el) return;

  const { data: logs, error } = await sb
    .from('change_log')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(20);

  if (error) { el.innerHTML = '<div class="empty">Error loading activity.</div>'; return; }
  if (!logs?.length) { el.innerHTML = '<div class="empty">No recent activity.</div>'; return; }

  // Collect fighter / event ids we need to resolve for labels
  const fighterIds = new Set();
  const eventIds = new Set();
  const fightIds = new Set();
  for (const l of logs) {
    const c = l.changes || {};
    if (c.fighter1_id) fighterIds.add(c.fighter1_id);
    if (c.fighter2_id) fighterIds.add(c.fighter2_id);
    if (c.event_id) eventIds.add(c.event_id);
    if (c.fight_id) fightIds.add(c.fight_id);
    if (l.table_name === 'fighters') fighterIds.add(l.row_id);
    if (l.table_name === 'events') eventIds.add(l.row_id);
    if (l.table_name === 'fights') fightIds.add(l.row_id);
  }

  const [fightersRes, eventsRes, fightsRes] = await Promise.all([
    fighterIds.size ? sb.from('fighters').select('id,name').in('id', [...fighterIds]) : Promise.resolve({data:[]}),
    eventIds.size   ? sb.from('events').select('id,name').in('id', [...eventIds])     : Promise.resolve({data:[]}),
    fightIds.size   ? sb.from('fight_search').select('id,fighter1_name,fighter2_name,event_name').in('id', [...fightIds]) : Promise.resolve({data:[]})
  ]);
  const fighterMap = Object.fromEntries((fightersRes.data || []).map(f => [f.id, f.name]));
  const eventMap   = Object.fromEntries((eventsRes.data || []).map(e => [e.id, e.name]));
  const fightMap   = Object.fromEntries((fightsRes.data || []).map(f => [f.id, f]));

  function describe(log) {
    const c = log.changes || {};
    const action = log.action;
    const t = log.table_name;
    if (t === 'ratings') {
      const fight = fightMap[c.fight_id];
      const label = fight ? `${fight.fighter1_name} vs ${fight.fighter2_name}` : 'a fight';
      if (action === 'DELETE') return `Removed rating for ${label}`;
      const r = c.rating != null ? ` — ${c.rating}★` : '';
      return `${action === 'INSERT' ? 'Rated' : 'Updated rating'}: ${label}${r}`;
    }
    if (t === 'fights') {
      const fight = fightMap[log.row_id];
      const label = fight
        ? `${fight.fighter1_name} vs ${fight.fighter2_name}`
        : (c.fighter1_id && c.fighter2_id ? `${fighterMap[c.fighter1_id]||'?'} vs ${fighterMap[c.fighter2_id]||'?'}` : 'a fight');
      if (action === 'INSERT') return `Added fight: ${label}`;
      if (action === 'DELETE') return `Deleted fight: ${label}`;
      return `Updated fight: ${label}`;
    }
    if (t === 'events') {
      const name = eventMap[log.row_id] || c.name || 'an event';
      if (action === 'INSERT') return `Added event: ${name}`;
      if (action === 'DELETE') return `Deleted event: ${name}`;
      return `Updated event: ${name}`;
    }
    if (t === 'fighters') {
      const name = fighterMap[log.row_id] || c.name || 'a fighter';
      if (action === 'INSERT') return `Added fighter: ${name}`;
      if (action === 'DELETE') return `Deleted fighter: ${name}`;
      return `Updated fighter: ${name}`;
    }
    return `${action} on ${t}`;
  }

  el.innerHTML = logs.map(log => `
    <div class="activity-row">
      <span class="activity-desc">${escHtml(describe(log))}</span>
      <span class="activity-time">${relativeTime(log.logged_at)}</span>
    </div>
  `).join('');
}

function renderMethodChart() {
  const counts = {};
  filterDashYear(myRatings).forEach(f => { const k = f.method||'Other'; counts[k]=(counts[k]||0)+1; });
  const labels = Object.keys(counts), data = Object.values(counts);
  const colors = ['#E24B4A','#1D9E75','#378ADD','#BA7517','#7F77DD','#D4537E','#888780'];
  document.getElementById('method-legend').innerHTML = labels.map((l,i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${colors[i%colors.length]}"></span>${escHtml(l)} <strong>${data[i]}</strong></span>`
  ).join('');
  const ctx = document.getElementById('methodChart');
  if (methodChartInst) { methodChartInst.destroy(); methodChartInst = null; }
  if (!labels.length) return;
  methodChartInst = new Chart(ctx, {type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors.slice(0,labels.length),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
}


function normalizeWeightClass(wc) {
  if (!wc) return wc;
  return /catch\s*weight/i.test(wc) ? 'Catchweight' : wc;
}

function renderWcBars() {
  const stats = {};
  filterDashYear(myRatings).forEach(f => {
    if (!f.weight_class) return;
    const wc = normalizeWeightClass(f.weight_class);
    if (!stats[wc]) stats[wc] = { count: 0, total: 0, rated: 0 };
    stats[wc].count++;
    if (f.rating) { stats[wc].total += f.rating; stats[wc].rated++; }
  });
  const sorted = Object.entries(stats).sort((a,b) => b[1].count - a[1].count);
  const max = sorted.length ? sorted[0][1].count : 1;
  const el = document.getElementById('wc-bars');
  if (!sorted.length) { el.innerHTML='<div class="empty">No data yet.</div>'; return; }
  el.innerHTML = sorted.map(([wc, s]) => {
    const avg = s.rated ? (s.total / s.rated).toFixed(1) : '—';
    return `<div class="wc-row"><div class="wc-name" title="${wc}">${wc}</div><div class="wc-bar-bg"><div class="wc-bar-fill" style="width:${Math.round(s.count/max*100)}%"></div></div><div class="wc-n">${s.count}</div><div class="wc-avg">${avg} ★</div></div>`;
  }).join('');
}

function fighterFightTime(f) {
  if (!f.round) return 0;
  if (f.time) {
    const parts = f.time.split(':').map(Number);
    return (f.round - 1) * 5 * 60 + (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return f.round * 5 * 60;
}

function renderLeaderboard() {
  const wc = (document.getElementById('leaderboard-wc')?.value) || '';
  const source = filterDashYear(wc ? myRatings.filter(f => f.weight_class === wc) : myRatings);

  const map = {};
  source.forEach(f => {
    const hasRank = !!(f.fighter1_rank || f.fighter2_rank);
    [{name: f.fighter1_name, id: f.fighter1_id}, {name: f.fighter2_name, id: f.fighter2_id}]
      .filter(x => x.name).forEach(fighter => {
        if (!map[fighter.name]) map[fighter.name] = {name: fighter.name, id: fighter.id, fights:0, wins:0, losses:0, decisionWins:0, finishWins:0, koWins:0, subWins:0, timeSec:0, ratings:[], rankedFights:0};
        const e = map[fighter.name];
        if (fighter.id) e.id = fighter.id;
        e.fights++;
        e.timeSec += fighterFightTime(f);
        if (hasRank) e.rankedFights++;
        if (f.rating) e.ratings.push(f.rating);
        if (f.winner_name === fighter.name) {
          e.wins++;
          const ml = (f.method || '').toLowerCase();
          if (ml.includes('decision') || ml.includes('dec')) e.decisionWins++;
          else if (ml.includes('ko') || ml.includes('tko')) { e.finishWins++; e.koWins++; }
          else if (ml.includes('submission') || ml.includes('sub')) { e.finishWins++; e.subWins++; }
        } else if (f.winner_name && f.winner_name !== fighter.name) {
          e.losses++;
        }
      });
  });

  Object.values(map).forEach(f => {
    f.avgRating = f.ratings.length ? f.ratings.reduce((a,b)=>a+b,0)/f.ratings.length : 0;
  });

  const all = Object.values(map);

  function renderList(elId, sorted, valueFn) {
    const el = document.getElementById(elId);
    const filtered = sorted.filter(f => valueFn(f) > 0).slice(0, 10);
    if (!filtered.length) { el.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; return; }
    el.innerHTML = filtered.map((f, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <button class="nav-link lb-name" onclick="navToFighter('${f.id}','${f.name.replace(/'/g,"\\'")}')">${escHtml(f.name)}</button>
        <span class="lb-val">${valueFn(f)}</span>
      </div>`).join('');
  }

  renderList('lb-fights',    [...all].sort((a,b) => b.fights - a.fights),             f => f.fights);
  renderList('lb-wins',      [...all].sort((a,b) => b.wins - a.wins),                 f => f.wins);
  renderList('lb-decisions', [...all].sort((a,b) => b.decisionWins - a.decisionWins), f => f.decisionWins);
  renderList('lb-finishes',  [...all].sort((a,b) => b.finishWins - a.finishWins),     f => f.finishWins);
  renderList('lb-ko',        [...all].sort((a,b) => b.koWins - a.koWins),             f => f.koWins);
  renderList('lb-sub',       [...all].sort((a,b) => b.subWins - a.subWins),           f => f.subWins);
  renderList('lb-losses',    [...all].sort((a,b) => b.losses - a.losses),             f => f.losses);

  // Highest rated fights (individual fights, not fighters)
  const rankedEl = document.getElementById('lb-ranked');
  const topFights = [...source]
    .filter(f => f.rating && f.fighter1_name && f.fighter2_name)
    .sort((a,b) => b.rating - a.rating)
    .slice(0, 10);
  if (!topFights.length) { rankedEl.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; }
  else {
    rankedEl.innerHTML = topFights.map((f, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <button class="nav-link lb-name" onclick="navToEvent('${f.event_id}')" title="${escHtml(f.fighter1_name)} vs ${escHtml(f.fighter2_name)}">${escHtml(f.fighter1_name)} vs ${escHtml(f.fighter2_name)}</button>
        <span class="lb-val">${f.rating} ★</span>
      </div>`).join('');
  }

  function renderCustom(elId, sorted, valueFn, formatFn) {
    const el = document.getElementById(elId);
    const filtered = sorted.filter(f => valueFn(f) > 0).slice(0, 10);
    if (!filtered.length) { el.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; return; }
    el.innerHTML = filtered.map((f, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <button class="nav-link lb-name" onclick="navToFighter('${f.id}','${f.name.replace(/'/g,"\\'")}')">${escHtml(f.name)}</button>
        <span class="lb-val">${formatFn(f)}</span>
      </div>`).join('');
  }

  renderCustom('lb-time',
    [...all].sort((a,b) => b.timeSec - a.timeSec),
    f => f.timeSec,
    f => formatFightTime(f.timeSec));

  renderCustom('lb-rating',
    all.filter(f => f.ratings.length >= 3).sort((a,b) => b.avgRating - a.avgRating),
    f => f.avgRating,
    f => f.avgRating.toFixed(2) + ' ★');

  const lowEl = document.getElementById('lb-rating-low');
  const lowSorted = all.filter(f => f.ratings.length >= 3).sort((a,b) => a.avgRating - b.avgRating).slice(0, 10);
  if (!lowSorted.length) { lowEl.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; }
  else {
    lowEl.innerHTML = lowSorted.map((f, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <button class="nav-link lb-name" onclick="navToFighter('${f.id}','${f.name.replace(/'/g,"\\'")}')">${escHtml(f.name)}</button>
        <span class="lb-val">${f.avgRating.toFixed(2)} ★</span>
      </div>`).join('');
  }
}
