// ── Dark Mode ────────────────────────────────────────────────────────────────
(function() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }
  document.documentElement.classList.remove('dark-pending');
})();

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', isDark);
}

// ── Navigation helpers ────────────────────────────────────────────────────────

let navReturnContext = null; // { type: 'event'|'fighter', data: obj }

function activateView(viewId, navLabel) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => { if (btn.textContent.trim() === navLabel) btn.classList.add('active'); });
}

function navToFighter(id, name) {
  navReturnContext = currentEvent ? { type: 'event', data: currentEvent } : null;
  activateView('view-fighter', 'Fighter');
  selectFighterForPage({ id, name });
}

async function navToEvent(eventId) {
  navReturnContext = currentFighter ? { type: 'fighter', data: currentFighter } : null;
  const { data } = await sb.from('events').select('*').eq('id', eventId).single();
  if (!data) return;
  activateView('view-log', 'Rate event');
  selectEvent(data);
}

// ── Shared state ──────────────────────────────────────────────────────────────
let myRatings = [];
let selectedFight = null;
let currentRating = 0;
let methodChartInst = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadRatings(), tryLoadDB()]);
  renderTable();
}

async function tryLoadDB() {
  setStatus('Checking database…');
  try {
    const { count, error } = await sb
      .from('fights')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    if (count > 0) showDbReady(count);
    else showNoDb();
  } catch(e) {
    showNoDb();
  }
}

// ── Shared Helpers ────────────────────────────────────────────────────────────

function hl(name, q) {
  if (!name) return '';
  const i = name.toLowerCase().indexOf(q);
  if (i === -1) return name;
  return name.slice(0,i) + '<strong>' + name.slice(i,i+q.length) + '</strong>' + name.slice(i+q.length);
}

function shortM(m) {
  if (!m) return '—';
  return m.replace('Decision (','').replace(')','');
}

function slugPosType(t) { return (t||'').toLowerCase().replace(/\s+/g,'-'); }

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function starSVG(fill, size) {
  size = size || 26;
  const id = 'g'+Math.random().toString(36).slice(2);
  const pts = '12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26';
  if (fill==='full') return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24"><polygon points="'+pts+'" fill="#E24B4A" stroke="#E24B4A" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  if (fill==='half') return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24"><defs><linearGradient id="'+id+'" x1="0%" x2="100%"><stop offset="50%" stop-color="#E24B4A"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><polygon points="'+pts+'" fill="url(#'+id+')" stroke="#E24B4A" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24"><polygon points="'+pts+'" fill="transparent" stroke="#ccc" stroke-width="1.5" stroke-linejoin="round"/></svg>';
}

function buildStars(rating, size) {
  size = size || 26;
  let h = '';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) h += starSVG('full', size);
    else if (rating >= i-0.5) h += starSVG('half', size);
    else h += starSVG('empty', size);
  }
  return h;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
