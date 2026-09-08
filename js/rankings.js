// ── Rankings ──────────────────────────────────────────────────────────────────
// Divisional + pound-for-pound rankings from the `rankings` table, which
// rankings_scraper.py refreshes nightly from ufc.com and Sherdog. The table is a
// history of dated snapshots (a new one is stored whenever a source's lists
// change), so the tab shows the latest by default and an "as of" picker opens
// any earlier snapshot. One source at a time; each division is a card,
// champion on top.

let rankingsSnapshots = null;   // rows of the rankings_snapshots view, newest first
const rankingsCache = {};       // `${source}|${snapshot_date}` -> rows
let rankingsSource = 'ufc';
let rankingsDate = null;        // null = latest snapshot for the source
let rankingsRenderSeq = 0;      // guards against a slow load painting over a newer selection

const RANKINGS_SOURCES = {
  ufc:     { label: 'UFC',     url: 'https://www.ufc.com/rankings',
             note: 'Official UFC rankings — champion plus top 15 per division, voted on by a media panel.' },
  sherdog: { label: 'Sherdog', url: 'https://www.sherdog.com/news/rankings/list',
             note: 'Sherdog staff rankings — top 10 per division across every promotion.' },
};

// Display order; anything the scraper adds that isn't listed sorts to the end.
const RANKINGS_DIVISION_ORDER = [
  "Men's Pound-for-Pound", 'Heavyweight', 'Light Heavyweight', 'Middleweight',
  'Welterweight', 'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight',
  "Women's Pound-for-Pound", "Women's Featherweight", "Women's Bantamweight",
  "Women's Flyweight", "Women's Strawweight", "Women's Atomweight",
];

async function openRankings() {
  if (!rankingsSnapshots) {
    const grid = document.getElementById('rankings-grid');
    if (grid) grid.innerHTML = loadingHtml('Loading rankings…');
    await loadRankingsSnapshots();
  }
  return renderRankings();
}

async function loadRankingsSnapshots() {
  const { data, error } = await sb.from('rankings_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false });
  rankingsSnapshots = error ? [] : (data || []);
}

function rankingsDatesFor(src) {
  return (rankingsSnapshots || []).filter(s => s.source === src).map(s => s.snapshot_date);
}

async function loadRankingsRows(src, date) {
  const key = `${src}|${date}`;
  if (rankingsCache[key]) return rankingsCache[key];
  // fighters(image_url) rides along via the fighter_id FK for the avatars
  const { data, error } = await sb.from('rankings')
    .select('*, fighters(image_url)')
    .eq('source', src)
    .eq('snapshot_date', date)
    .order('division')
    .order('rank');
  rankingsCache[key] = error ? [] : (data || []);
  return rankingsCache[key];
}

function switchRankingsSource(src) {
  rankingsSource = src;
  rankingsDate = null;          // back to the latest when changing source
  return renderRankings();
}

function switchRankingsDate(date) {
  rankingsDate = date || null;
  return renderRankings();
}

function rankingsChange(r) {
  if (r.rank === 0) return '';
  if (r.is_new) return '<span class="rk-change new">NEW</span>';
  if (r.previous_rank == null || r.previous_rank === r.rank) return '<span class="rk-change same">–</span>';
  const d = r.previous_rank - r.rank;
  return d > 0 ? `<span class="rk-change up" title="Up ${d} from #${r.previous_rank}">▲${d}</span>`
               : `<span class="rk-change down" title="Down ${-d} from #${r.previous_rank}">▼${-d}</span>`;
}

// Same no-referrer rule as the fighter page: Sherdog 403s hotlinked photos when
// a Referer is sent. Initials sit underneath so a dropped img uncovers them.
function rankingsAvatar(r) {
  const img = r.fighters && r.fighters.image_url;
  return `<span class="rk-avatar">${escHtml(fighterInitials(r.fighter_name))}${img
    ? `<img src="${escHtml(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`
    : ''}</span>`;
}

function rankingsName(r) {
  if (r.fighter_id) {
    return `<button class="nav-link rk-name" data-name="${escHtml(r.fighter_name)}"
              onclick="navToFighter(${r.fighter_id}, this.dataset.name)">${escHtml(r.fighter_name)}</button>`;
  }
  // Not matched to a fighter in the DB yet — link out to the source instead.
  const src = RANKINGS_SOURCES[r.source];
  return r.source_url
    ? `<a class="rk-name rk-ext" href="${escHtml(r.source_url)}" target="_blank" rel="noopener noreferrer"
          title="Not in the database yet — opens on ${escHtml(src ? src.label : r.source)}">${escHtml(r.fighter_name)} ↗</a>`
    : `<span class="rk-name">${escHtml(r.fighter_name)}</span>`;
}

function rankingsMeta(r) {
  const bits = [r.record, r.promotion].filter(Boolean);
  return bits.length ? `<span class="rk-meta">${escHtml(bits.join(' · '))}</span>` : '';
}

function renderRankingsDatePicker(dates, selected) {
  const sel = document.getElementById('rankings-date');
  if (!sel) return;
  sel.innerHTML = dates.map((d, i) =>
    `<option value="${escHtml(d)}"${d === selected ? ' selected' : ''}>${escHtml(formatEventDate(d))}${i === 0 ? ' (latest)' : ''}</option>`
  ).join('');
  sel.style.display = dates.length > 1 ? '' : 'none';
}

async function renderRankings() {
  const grid = document.getElementById('rankings-grid');
  const meta = document.getElementById('rankings-meta');
  if (!grid) return;
  const seq = ++rankingsRenderSeq;
  document.querySelectorAll('.rankings-tab').forEach(b => b.classList.toggle('active', b.dataset.source === rankingsSource));

  const src   = RANKINGS_SOURCES[rankingsSource] || { label: rankingsSource, url: '#', note: '' };
  const dates = rankingsDatesFor(rankingsSource);
  const date  = rankingsDate && dates.includes(rankingsDate) ? rankingsDate : dates[0];
  renderRankingsDatePicker(dates, date);
  if (!date) {
    meta.innerHTML = '';
    grid.innerHTML = `<div class="empty">No ${escHtml(src.label)} rankings loaded yet — the nightly scraper fills these in.</div>`;
    return;
  }

  if (!rankingsCache[`${rankingsSource}|${date}`]) {
    grid.innerHTML = '<div class="dash-loading"><span class="spinner"></span> Loading rankings…</div>';
  }
  const rows = await loadRankingsRows(rankingsSource, date);
  if (seq !== rankingsRenderSeq) return;    // the user moved on while this loaded

  const isLatest = date === dates[0];
  meta.innerHTML = `${escHtml(src.note)} `
    + (isLatest
        ? `As of ${escHtml(formatEventDate(date))}`
        : `<span class="rk-historic">Showing the rankings as published on ${escHtml(formatEventDate(date))}</span>`
          + ` · <a href="#" onclick="switchRankingsDate(null);return false;">Back to latest</a>`)
    + (dates.length > 1 ? ` · ${dates.length} snapshots stored` : '')
    + ` · <a href="${escHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escHtml(src.label)} ↗</a>`;

  const byDiv = new Map();
  rows.forEach(r => { if (!byDiv.has(r.division)) byDiv.set(r.division, []); byDiv.get(r.division).push(r); });
  const order = d => { const i = RANKINGS_DIVISION_ORDER.indexOf(d); return i === -1 ? 999 : i; };
  const divisions = [...byDiv.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));

  // One portrait per card: the champion, or the #1 on lists without a champion
  // slot (Sherdog, P4P). Everyone else is a plain text row.
  grid.innerHTML = divisions.map(d => {
    const list   = byDiv.get(d).sort((a, b) => a.rank - b.rank);
    const champ  = list.find(r => r.rank === 0);
    const top    = champ || list[0];
    const rest   = list.filter(r => r !== top);
    const label  = champ ? 'Champion' : `#${top.rank}`;
    return `<div class="leaderboard-col rk-col">
      <div class="leaderboard-title">${escHtml(d)}</div>
      <div class="rk-top${champ ? ' rk-champ' : ''}">${rankingsAvatar(top)}
        <div class="rk-top-body"><span class="rk-top-lbl">${label}</span>${rankingsName(top)}${rankingsMeta(top)}</div>${champ ? '' : rankingsChange(top)}
      </div>
      ${rest.map(r => `<div class="rk-row">
        <span class="rk-rank">${r.rank}</span>
        <span class="rk-body">${rankingsName(r)}${rankingsMeta(r)}</span>${rankingsChange(r)}
      </div>`).join('')}
    </div>`;
  }).join('');
}
