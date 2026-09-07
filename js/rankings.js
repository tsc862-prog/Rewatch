// ── Rankings ──────────────────────────────────────────────────────────────────
// Divisional + pound-for-pound rankings from the `rankings` table, which
// rankings_scraper.py refreshes nightly from ufc.com and Sherdog. One source is
// shown at a time (tab); each division is a card, champion on top.

let rankingsRows = null;      // every row from the table, all sources — loaded once
let rankingsSource = 'ufc';
let rankingsLoading = false;

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
  if (!rankingsRows && !rankingsLoading) await loadRankings();
  renderRankings();
}

async function loadRankings() {
  rankingsLoading = true;
  const grid = document.getElementById('rankings-grid');
  if (grid) grid.innerHTML = '<div class="dash-loading"><span class="spinner"></span> Loading rankings…</div>';
  // fighters(image_url) rides along via the fighter_id FK for the avatars
  const { data, error } = await sb.from('rankings')
    .select('*, fighters(image_url)')
    .order('division')
    .order('rank');
  rankingsRows = error ? [] : (data || []);
  rankingsLoading = false;
}

function switchRankingsSource(src) {
  rankingsSource = src;
  renderRankings();
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

function renderRankings() {
  const grid = document.getElementById('rankings-grid');
  const meta = document.getElementById('rankings-meta');
  if (!grid || rankingsLoading) return;
  document.querySelectorAll('.rankings-tab').forEach(b => b.classList.toggle('active', b.dataset.source === rankingsSource));

  const src  = RANKINGS_SOURCES[rankingsSource] || { label: rankingsSource, url: '#', note: '' };
  const rows = (rankingsRows || []).filter(r => r.source === rankingsSource);
  if (!rows.length) {
    meta.innerHTML = '';
    grid.innerHTML = `<div class="empty">No ${escHtml(src.label)} rankings loaded yet — the nightly scraper fills these in.</div>`;
    return;
  }
  const updated = rows.reduce((m, r) => (r.scraped_at > m ? r.scraped_at : m), '');
  meta.innerHTML = `${escHtml(src.note)} Updated ${escHtml(formatEventDate(updated))} · `
    + `<a href="${escHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escHtml(src.label)} ↗</a>`;

  const byDiv = new Map();
  rows.forEach(r => { if (!byDiv.has(r.division)) byDiv.set(r.division, []); byDiv.get(r.division).push(r); });
  const order = d => { const i = RANKINGS_DIVISION_ORDER.indexOf(d); return i === -1 ? 999 : i; };
  const divisions = [...byDiv.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));

  grid.innerHTML = divisions.map(d => {
    const list   = byDiv.get(d).sort((a, b) => a.rank - b.rank);
    const champ  = list.find(r => r.rank === 0);
    const ranked = list.filter(r => r.rank > 0);
    return `<div class="leaderboard-col rk-col">
      <div class="leaderboard-title">${escHtml(d)}</div>
      ${champ ? `<div class="rk-champ">${rankingsAvatar(champ)}
        <div class="rk-champ-body"><span class="rk-champ-lbl">Champion</span>${rankingsName(champ)}</div></div>` : ''}
      ${ranked.map(r => `<div class="rk-row">
        <span class="rk-rank">${r.rank}</span>${rankingsAvatar(r)}
        <span class="rk-body">${rankingsName(r)}${rankingsMeta(r)}</span>${rankingsChange(r)}
      </div>`).join('')}
    </div>`;
  }).join('');
}
