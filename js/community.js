// ── Community Dashboard ───────────────────────────────────────────────────────
// Mirrors the personal dashboard but spans ALL fights and uses community average
// ratings (averaged across every user's ratings). Aggregated server-side via the
// community_dashboard RPC and filterable by organization + division.

let communityChartInst = null;
let communityOrgsLoaded = false;

async function openCommunityDashboard() {
  if (!communityOrgsLoaded) await loadCommunityFilters();
  renderCommunityDashboard();
}

// Populate the org dropdown ("All orgs", then UFC, then the rest by event count)
// and the year dropdown (most recent first).
async function loadCommunityFilters() {
  const orgSel = document.getElementById('community-org');
  const yearSel = document.getElementById('community-year');
  if (!orgSel) return;
  communityOrgsLoaded = true;
  const [orgs, years] = await Promise.all([
    sb.rpc('org_event_counts'),
    sb.rpc('event_years')
  ]);
  if (orgs.data) {
    const rest = orgs.data.map(r => r.organization).filter(o => o && o !== 'UFC');
    orgSel.innerHTML = '<option value="">All orgs</option>' +
      ['UFC', ...rest].map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
  }
  if (yearSel && years.data) {
    yearSel.innerHTML = '<option value="">All years</option>' +
      years.data.map(r => `<option value="${r.yr}">${r.yr}</option>`).join('');
  }
}

async function renderCommunityDashboard() {
  const org  = document.getElementById('community-org')?.value || null;
  const wc   = document.getElementById('community-wc')?.value || null;
  const year = document.getElementById('community-year')?.value;

  const { data, error } = await sb.rpc('community_dashboard', {
    p_org: org, p_wc: wc, p_year: year ? Number(year) : null
  });
  if (error || !data) return;

  const s = data.stats || {};
  document.getElementById('c-total').textContent    = (s.total_fights || 0).toLocaleString();
  document.getElementById('c-events').textContent   = (s.total_events || 0).toLocaleString();
  document.getElementById('c-finishes').textContent = (s.finishes || 0).toLocaleString();
  document.getElementById('c-avg').innerHTML        = s.avg_rating != null
    ? `${Number(s.avg_rating).toFixed(1)} <span style="color:#E24B4A;font-size:20px">★</span>` : '—';
  document.getElementById('c-time').textContent     = formatFightTime(s.total_time_sec || 0);

  renderCommunityMethodChart(data.methods || []);
  renderCommunityWcBars(data.weight_classes || []);
  renderCommunityLeaderboards(data.leaderboards || {}, data.top_fights || []);
}

function renderCommunityMethodChart(methods) {
  const labels = methods.map(m => m.method);
  const counts = methods.map(m => m.count);
  const palette = ['#E24B4A','#1D9E75','#378ADD','#BA7517','#7F77DD','#D4537E','#888780'];
  const colors = labels.map((_, i) => palette[i % palette.length]);
  document.getElementById('c-method-legend').innerHTML = labels.map((l, i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${escHtml(l)} <strong>${counts[i].toLocaleString()}</strong></span>`
  ).join('');
  const ctx = document.getElementById('cMethodChart');
  if (communityChartInst) { communityChartInst.destroy(); communityChartInst = null; }
  if (!labels.length) return;
  communityChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

function renderCommunityWcBars(wcs) {
  const el = document.getElementById('c-wc-bars');
  if (!wcs.length) { el.innerHTML = '<div class="empty">No data.</div>'; return; }
  const max = wcs[0].count || 1; // RPC returns ordered by count desc
  el.innerHTML = wcs.slice(0, 15).map(w => {
    const avg = w.avg_rating != null ? Number(w.avg_rating).toFixed(1) : '—';
    return `<div class="wc-row"><div class="wc-name" title="${escHtml(w.wc)}">${escHtml(w.wc)}</div><div class="wc-bar-bg"><div class="wc-bar-fill" style="width:${Math.round(w.count / max * 100)}%"></div></div><div class="wc-n">${w.count.toLocaleString()}</div><div class="wc-avg">${avg} ★</div></div>`;
  }).join('');
}

function renderCommunityList(elId, rows, fmt) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!rows || !rows.length) { el.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; return; }
  el.innerHTML = rows.map((f, i) =>
    `<div class="lb-row"><span class="lb-rank">${i + 1}</span><button class="nav-link lb-name" onclick="navToFighter('${f.fid}','${(f.name || '').replace(/'/g, "\\'")}')">${escHtml(f.name)}</button><span class="lb-val">${fmt(f.v)}</span></div>`
  ).join('');
}

function renderCommunityLeaderboards(lb, topFights) {
  const int = v => Number(v).toLocaleString();
  renderCommunityList('clb-fights',     lb.lb_fights,     int);
  renderCommunityList('clb-wins',       lb.lb_wins,       int);
  renderCommunityList('clb-decisions',  lb.lb_decisions,  int);
  renderCommunityList('clb-finishes',   lb.lb_finishes,   int);
  renderCommunityList('clb-ko',         lb.lb_ko,         int);
  renderCommunityList('clb-sub',        lb.lb_sub,        int);
  renderCommunityList('clb-time',       lb.lb_time,       v => formatFightTime(v));
  renderCommunityList('clb-losses',     lb.lb_losses,     int);
  renderCommunityList('clb-rating',     lb.lb_rating,     v => Number(v).toFixed(2) + ' ★');
  renderCommunityList('clb-rating-low', lb.lb_rating_low, v => Number(v).toFixed(2) + ' ★');

  const el = document.getElementById('clb-ranked');
  if (!el) return;
  if (!topFights.length) { el.innerHTML = '<div class="empty" style="padding:12px 0">—</div>'; return; }
  el.innerHTML = topFights.map((f, i) =>
    `<div class="lb-row"><span class="lb-rank">${i + 1}</span><button class="nav-link lb-name" onclick="navToEvent('${f.event_id}')" title="${escHtml(f.f1)} vs ${escHtml(f.f2)}">${escHtml(f.f1)} vs ${escHtml(f.f2)}</button><span class="lb-val">${Number(f.avg_rating).toFixed(1)} ★</span></div>`
  ).join('');
}
