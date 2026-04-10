// ── Views & Rendering ─────────────────────────────────────────────────────────

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
  if (m === 'KO/TKO') return `<span class="badge b-ko">KO/TKO</span>`;
  if (m === 'Submission') return `<span class="badge b-sub">Sub</span>`;
  if (m && m.includes('Decision')) return `<span class="badge b-dec">${m.replace('Decision (','').replace(')','')}</span>`;
  return `<span class="badge b-nc">${m}</span>`;
}

function renderTable() {
  const q    = (document.getElementById('search').value||'').toLowerCase();
  const wc   = document.getElementById('filter-wc').value;
  const meth = document.getElementById('filter-method').value;
  const filtered = myRatings.filter(f => {
    const txt = ((f.fighter1_name||'')+' '+(f.fighter2_name||'')+' '+(f.event_name||'')).toLowerCase();
    const mb  = f.method_broad||'';
    const mMatch = !meth || (meth==='KO/TKO'&&mb==='KO/TKO') || (meth==='Submission'&&mb==='Submission') || (meth==='Decision'&&mb.includes('Decision'));
    return (!q||txt.includes(q)) && (!wc||f.weight_class===wc) && mMatch;
  });
  const tbody = document.getElementById('fight-tbody');
  const empty = document.getElementById('table-empty');
  if (!filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(f => `<tr>
    <td title="${f.fighter1_name||''}">${f.fighter1_name||''}${f.winner_name===f.fighter1_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
    <td title="${f.fighter2_name||''}">${f.fighter2_name||''}${f.winner_name===f.fighter2_name?' <span style="color:#E24B4A;font-size:10px;font-weight:700">W</span>':''}</td>
    <td title="${f.event_name||''}">${f.event_name||'—'}</td>
    <td>${f.event_date||'—'}</td>
    <td title="${f.weight_class||''}">${f.weight_class||'—'}${f.is_title?' <span class="title-tag">🏆</span>':''}</td>
    <td>${methodBadge(f.method_broad)}</td>
    <td>${f.round?'R'+f.round+(f.time?' '+f.time:''):f.time||'—'}</td>
    <td><span style="display:inline-flex;gap:1px;vertical-align:middle">${f.rating?buildStars(f.rating,13):'—'}</span></td>
    <td><button class="btn-danger" onclick="deleteRating('${f.fight_id}')">Del</button></td>
  </tr>`).join('');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() {
  document.getElementById('d-total').textContent = myRatings.length;
  document.getElementById('d-events').textContent = new Set(myRatings.map(f=>f.event_name).filter(Boolean)).size;
  document.getElementById('d-finishes').textContent = myRatings.filter(f=>f.method_broad==='KO/TKO'||f.method_broad==='Submission').length;
  const rated = myRatings.filter(f => f.rating);
  const avg   = rated.length ? rated.reduce((a,b)=>a+b.rating,0)/rated.length : null;
  document.getElementById('d-avg').innerHTML = avg ? `${avg.toFixed(1)} <span style="color:#E24B4A;font-size:20px">★</span>` : '—';
  renderMethodChart();
  renderWcBars();
  renderFighters();
}

function renderMethodChart() {
  const counts = {};
  myRatings.forEach(f => { const k = f.method_broad||'Other'; counts[k]=(counts[k]||0)+1; });
  const labels = Object.keys(counts), data = Object.values(counts);
  const colors = ['#E24B4A','#1D9E75','#378ADD','#BA7517','#7F77DD','#D4537E','#888780'];
  document.getElementById('method-legend').innerHTML = labels.map((l,i) =>
    `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:${colors[i%colors.length]};flex-shrink:0"></span>${l} ${data[i]}</span>`
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

function renderFighters() {
  const q = (document.getElementById('fighter-search').value||'').toLowerCase();
  const map = {};
  myRatings.forEach(f => {
    [f.fighter1_name, f.fighter2_name].filter(Boolean).forEach(name => {
      if (!map[name]) map[name] = {name, fights:0, wins:0, ratings:[], methods:{}};
      map[name].fights++;
      if (f.winner_name === name) map[name].wins++;
      if (f.rating) map[name].ratings.push(f.rating);
      if (f.method_broad) map[name].methods[f.method_broad]=(map[name].methods[f.method_broad]||0)+1;
    });
  });
  const list = Object.values(map).filter(f=>!q||f.name.toLowerCase().includes(q)).sort((a,b)=>b.fights-a.fights);
  const el   = document.getElementById('fighter-list');
  if (!list.length) { el.innerHTML='<div class="empty">No fighters found.</div>'; return; }
  el.innerHTML = list.slice(0,20).map(f => {
    const avgR = f.ratings.length ? f.ratings.reduce((a,b)=>a+b,0)/f.ratings.length : null;
    const topM = Object.entries(f.methods).sort((a,b)=>b[1]-a[1])[0];
    return `<div class="fighter-card"><div class="fighter-name">${f.name}</div><div class="fighter-stats">
      <div class="fs">Fights<span>${f.fights}</span></div>
      <div class="fs">Wins<span>${f.wins}</span></div>
      <div class="fs">Losses<span>${f.fights-f.wins}</span></div>
      ${avgR!==null?`<div class="fs">Avg rating<span>${avgR.toFixed(1)} ★</span></div>`:''}
      ${topM?`<div class="fs">Top method<span>${topM[0]}</span></div>`:''}
    </div></div>`;
  }).join('');
}
