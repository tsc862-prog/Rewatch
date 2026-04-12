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
  if (!filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(f => {
    const hasNotes = !!f.notes;
    return `<tr class="ratings-row${hasNotes ? ' has-notes' : ''}">
      <td title="${f.fighter1_name||''}"><button class="nav-link" onclick="navToFighter('${f.fighter1_id}','${(f.fighter1_name||'').replace(/'/g,"\\'")}')">${f.fighter1_name||''}</button>${f.winner_name===f.fighter1_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
      <td title="${f.fighter2_name||''}"><button class="nav-link" onclick="navToFighter('${f.fighter2_id}','${(f.fighter2_name||'').replace(/'/g,"\\'")}')">${f.fighter2_name||''}</button>${f.winner_name===f.fighter2_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
      <td title="${f.event_name||''}"><button class="nav-link" onclick="navToEvent('${f.event_id}')">${f.event_name||'—'}</button></td>
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
  myRatings.forEach(f => {
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

function renderDashboard() {
  document.getElementById('d-total').textContent = myRatings.length;
  document.getElementById('d-events').textContent = new Set(myRatings.map(f=>f.event_name).filter(Boolean)).size;
  document.getElementById('d-finishes').textContent = myRatings.filter(f=>{ const ml=(f.method||'').toLowerCase(); return ml.includes('ko')||ml.includes('tko')||ml.includes('submission'); }).length;
  const rated = myRatings.filter(f => f.rating);
  const avg   = rated.length ? rated.reduce((a,b)=>a+b.rating,0)/rated.length : null;
  document.getElementById('d-avg').innerHTML = avg ? `${avg.toFixed(1)} <span style="color:#E24B4A;font-size:20px">★</span>` : '—';
  document.getElementById('d-time').textContent = formatFightTime(calcTotalFightTime());
  renderMethodChart();
  renderWcBars();
  renderFighters();
}

function renderMethodChart() {
  const counts = {};
  myRatings.forEach(f => { const k = f.method||'Other'; counts[k]=(counts[k]||0)+1; });
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

function renderWcBars() {
  const counts = {};
  myRatings.forEach(f => { if(f.weight_class) counts[f.weight_class]=(counts[f.weight_class]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  const el  = document.getElementById('wc-bars');
  if (!sorted.length) { el.innerHTML='<div class="empty">No data yet.</div>'; return; }
  el.innerHTML = sorted.map(([wc,n]) =>
    `<div class="wc-row"><div class="wc-name" title="${wc}">${wc}</div><div class="wc-bar-bg"><div class="wc-bar-fill" style="width:${Math.round(n/max*100)}%"></div></div><div class="wc-n">${n}</div></div>`
  ).join('');
}

function fighterFightTime(f) {
  if (!f.round) return 0;
  if (f.time) {
    const parts = f.time.split(':').map(Number);
    return (f.round - 1) * 5 * 60 + (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return f.round * 5 * 60;
}

function renderFighters() {
  const q = (document.getElementById('fighter-search').value||'').toLowerCase();
  const wc = (document.getElementById('fighter-filter-wc')?.value) || '';
  const sortBy = (document.getElementById('fighter-sort')?.value) || 'fights';

  // Build fighter map — optionally filter source ratings by division
  const source = wc ? myRatings.filter(f => f.weight_class === wc) : myRatings;
  const map = {};
  source.forEach(f => {
    [{name: f.fighter1_name, id: f.fighter1_id}, {name: f.fighter2_name, id: f.fighter2_id}].filter(x => x.name).forEach(fighter => {
      if (!map[fighter.name]) map[fighter.name] = {name: fighter.name, id: fighter.id, fights:0, wins:0, ratings:[], methods:{}, timeSec:0};
      const entry = map[fighter.name];
      if (fighter.id) entry.id = fighter.id;
      entry.fights++;
      entry.timeSec += fighterFightTime(f);
      if (f.winner_name === fighter.name) entry.wins++;
      if (f.rating) entry.ratings.push(f.rating);
      if (f.method) entry.methods[f.method]=(entry.methods[f.method]||0)+1;
    });
  });

  // Compute avg for sorting
  const withAvg = Object.values(map).map(f => {
    f.avgRating = f.ratings.length ? f.ratings.reduce((a,b)=>a+b,0)/f.ratings.length : 0;
    return f;
  });

  // Filter by search
  let list = withAvg.filter(f => !q || f.name.toLowerCase().includes(q));

  // Sort
  if (sortBy === 'wins') list.sort((a,b) => b.wins - a.wins || b.fights - a.fights);
  else if (sortBy === 'time') list.sort((a,b) => b.timeSec - a.timeSec);
  else if (sortBy === 'rating') list.sort((a,b) => b.avgRating - a.avgRating || b.fights - a.fights);
  else list.sort((a,b) => b.fights - a.fights);

  const el = document.getElementById('fighter-list');
  if (!list.length) { el.innerHTML='<div class="empty">No fighters found.</div>'; return; }
  el.innerHTML = list.slice(0,30).map(f => {
    const avgR = f.avgRating || null;
    const topM = Object.entries(f.methods).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="fighter-card"><div class="fighter-name"><button class="nav-link" onclick="navToFighter('${f.id}','${f.name.replace(/'/g,"\\'")}')">${escHtml(f.name)}</button></div><div class="fighter-stats">
      <div class="fs">Fights<span>${f.fights}</span></div>
      <div class="fs">Wins<span>${f.wins}</span></div>
      <div class="fs">Losses<span>${f.fights-f.wins}</span></div>
      <div class="fs">Fight time<span>${formatFightTime(f.timeSec)}</span></div>
      ${avgR?`<div class="fs">Avg rating<span>${avgR.toFixed(1)} ★</span></div>`:''}
      ${topM?`<div class="fs">Top method<span>${topM[0]}</span></div>`:''}
    </div></div>`;
  }).join('');
}
