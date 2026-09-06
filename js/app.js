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
  // Swap org logos to their light-on-dark variants without a re-render
  document.querySelectorAll('.org-badge.has-logo img[data-file]').forEach(img => {
    img.src = orgLogoSrc(img.dataset.file);
  });
}

// ── Navigation helpers ────────────────────────────────────────────────────────

let navReturnContext = null; // { type: 'event'|'fighter', data: obj }

function activateView(viewId) {
  const v = viewId.replace(/^view-/, '');
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === v));
}

function navToFighter(id, name) {
  navReturnContext = currentEvent ? { type: 'event', data: currentEvent } : null;
  activateView('view-fighter');
  selectFighterForPage({ id, name });
}

async function navToEvent(eventId) {
  navReturnContext = currentFighter ? { type: 'fighter', data: currentFighter } : null;
  const { data } = await sb.from('events').select('*').eq('id', eventId).single();
  if (!data) return;
  activateView('view-log');
  selectEvent(data);
}

// ── Aggregate ratings (community avg) ─────────────────────────────────────────
let fightAggregates = new Map(); // fight_id → { avg, count }

async function loadFightAggregates() {
  const { data, error } = await sb.rpc('fight_rating_stats');
  if (error || !data) { fightAggregates = new Map(); return; }
  fightAggregates = new Map(data.map(r => [r.fight_id, { avg: Number(r.avg_rating), count: Number(r.rating_count) }]));
}

// ── Shared state ──────────────────────────────────────────────────────────────
let appDataReady = false; // true once the initial ratings/aggregates have loaded
let myRatings = [];
let selectedFight = null;
let currentRating = 0;
let methodChartInst = null;
let ratingChartInst = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
let currentUser = null;
let authMode = 'login';

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  document.getElementById('auth-password').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');
  errEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Please wait…';

  const fn = authMode === 'login' ? sb.auth.signInWithPassword : sb.auth.signUp;
  const { data, error } = await fn.call(sb.auth, { email, password });

  submitBtn.disabled = false;
  submitBtn.textContent = authMode === 'login' ? 'Log in' : 'Create account';

  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = 'block';
    return false;
  }

  if (authMode === 'signup' && !data.session) {
    errEl.textContent = 'Check your email to confirm your account, then log in.';
    errEl.style.display = 'block';
    errEl.style.color = '#3B6D11';
    switchAuthTab('login');
    return false;
  }

  currentUser = data.user;
  await enterApp();
  return false;
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  myRatings = [];
  updateAuthUI();
  renderTable();
  if (typeof renderActiveEventsTab === 'function') renderActiveEventsTab();
}

async function enterApp() {
  hideAuthScreen();
  updateAuthUI();
  await loadRatings();
  appDataReady = true;
  renderTable();
  if (typeof renderActiveEventsTab === 'function') renderActiveEventsTab();
  // Only refresh the card the user is looking at — the two cards clear each
  // other's DOM on render, so re-rendering both would blank the visible one
  const activeViewEl = document.querySelector('.view.active');
  if (currentEvent && activeViewEl && activeViewEl.id === 'view-log') renderEventCard();
  else if (currentFighter && activeViewEl && activeViewEl.id === 'view-fighter') renderFighterCard();
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-error').style.display = 'none';
}

function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}

function requireAuth(action) {
  if (currentUser) return true;
  showAuthScreen();
  showToast('Log in to ' + (action || 'rate fights'));
  return false;
}

function updateAuthUI() {
  const isAuthed = !!currentUser;
  document.getElementById('user-email').textContent = isAuthed ? currentUser.email : '';
  document.getElementById('user-email').style.display = isAuthed ? '' : 'none';
  document.getElementById('logout-btn').style.display = isAuthed ? '' : 'none';
  document.getElementById('login-btn').style.display = isAuthed ? 'none' : '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const { data } = await sb.auth.getSession();
  if (data.session) currentUser = data.session.user;
  document.getElementById('app-shell').style.display = 'block';
  updateAuthUI();
  await Promise.all([currentUser ? loadRatings() : Promise.resolve(), tryLoadDB(), loadFightAggregates()]);
  appDataReady = true;
  renderTable();
  // If the user navigated to the dashboard while data was still loading, render it now
  if (document.getElementById('view-dashboard')?.classList.contains('active')) renderDashboard();
}

async function tryLoadDB() {
  setStatus('Checking database…');
  try {
    const { count, error } = await sb
      .from('fights')
      .select('*', { count: 'exact', head: true })
      .not('is_amateur', 'is', true);
    if (error) throw error;
    if (count > 0) showDbReady(count);
    else showNoDb();
  } catch(e) {
    showNoDb();
  }
}

// ── Shared Helpers ────────────────────────────────────────────────────────────

// Map an org name to its logo file in img/logos/. Add an entry here once the file exists.
// Files are the real marks (Wikipedia/Commons, official sites, or channel art),
// trimmed to a transparent background so they sit on the white badge chip.
const ORG_LOGOS = {
  'UFC':             'ufc.png',
  'PFL':             'pfl.png',
  'WEC':             'wec.png',
  'PRIDE':           'pride.png',
  'Pancrase':        'pancrase.png',
  'Shooto':          'shooto.png',
  'King of the Cage':'kingofthecage.png',
  'EliteXC':         'elitexc.png',
  'Bellator':        'bellator.svg',
  'Cage Warriors':   'cagewarriors.png',
  'LFA':             'lfa.png',
  'CFFC':            'cffc.png',
  'Fury FC':         'furyfc.png',
  'Titan FC':        'titanfc.png',
  'Invicta FC':      'invictafc.png',
  'Strikeforce':     'strikeforce.png',
  'WSOF':            'wsof.png',
  'RIZIN':           'rizin.png',
  'DWCS':            'dwcs.png',
  'Road to UFC':     'roadtoufc.png',
  'Vale Tudo Japan': 'valetudojapan.png',
  'Affliction':      'affliction.png',
  'MVP':             'mvp.png',
  'XFN':             'xfn.png',
  'Eternal MMA':     'eternalmma.png',
  'JCK':             'jck.png',
  'CES MMA':         'cesmma.png',
  'UAE Warriors':    'uaewarriors.png',
  'Legacy FC':       'legacyfc.png',
  'LUX':             'lux.png',
  'UWC':             'uwc.png',
  'Ares FC':         'aresfc.png',
  'A1 Combat':       'a1combat.png',
  'APFC':            'apfc.png',
  'iKON FC':         'ikonfc.png',
  'ONE Championship':'onechampionship.png',
  'Tuff-N-Uff':      'tuffnuff.png',
  'Alaska FC':       'alaskafc.png',
  'Shooto Brazil':   'shootobrazil.png',
  'Brave CF':        'bravecf.png',
  'BFL':             'bfl.png',
  'Unified MMA':     'unifiedmma.png',
  'INKA MMA':        'inkamma.png',
  'WXC':             'wxc.png',
  'FAC':             'fac.png',
  'ZFN':             'zfn.png',
  'Bison Kombat':    'bisonkombat.png',
  'Combat FC':       'combatfc.png',
  'FCC':             'fcc.png',
  'Fight Club Rush': 'fightclubrush.png',
  'Shuriken Fight Series': 'shurikenfightseries.png',
};
// Sort comparator for org dropdowns: UFC pinned to the top, everything else
// alphabetical. Case-insensitive so 'iKON FC' files under I, not after Z.
function byOrgName(a, b) {
  if (a === b) return 0;
  if (a === 'UFC') return -1;
  if (b === 'UFC') return 1;
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

// Path for a logo file. Every logo has a dark-mode twin in img/logos/dark/ where
// the black/grey parts are lightened and brand colours are kept.
function orgLogoSrc(file) {
  const dark = document.body.classList.contains('dark');
  return dark ? `img/logos/dark/${file}` : `img/logos/${file}`;
}

function orgBadge(org) {
  if (!org) return '';
  const slug = org.toLowerCase().replace(/[^a-z0-9]/g, '');
  const file = ORG_LOGOS[org];
  if (file) {
    return `<span class="org-badge org-${slug} has-logo" title="${escHtml(org)}"><img src="${orgLogoSrc(file)}" data-file="${file}" alt="${escHtml(org)}"></span>`;
  }
  return `<span class="org-badge org-${slug}">${escHtml(org)}</span>`;
}

// Dev helper: warn once if any organization in the data has no logo registered
// in ORG_LOGOS (so it renders as a plain text badge). Add an icon + map entry to fix.
let _orgLogoAuditDone = false;
function auditOrgLogos(events) {
  if (_orgLogoAuditDone || !Array.isArray(events)) return;
  _orgLogoAuditDone = true;
  const missing = [...new Set(events.map(e => e && e.organization).filter(Boolean))]
    .filter(org => !ORG_LOGOS[org])
    .sort();
  if (missing.length) {
    console.warn(`[orgBadge] ${missing.length} organization(s) without a logo — add to ORG_LOGOS in js/app.js:`, missing);
  }
}

// Event-level watch link — Paramount+ (UFC) or ESPN (PFL)
function eventWatchPill(evt) {
  let h = '';
  if (evt.paramount_url) h += `<a class="recent-event-p" href="${escHtml(evt.paramount_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  if (evt.espn_url) h += `<a class="recent-event-p espn" href="${escHtml(evt.espn_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  if (evt.espn_prelims_url) h += `<a class="recent-event-p espn" href="${escHtml(evt.espn_prelims_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Prelims</a>`;
  if (evt.fightpass_url) h += `<a class="recent-event-p fightpass" href="${escHtml(evt.fightpass_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  if (evt.fightpass_prelims_url) h += `<a class="recent-event-p fightpass" href="${escHtml(evt.fightpass_prelims_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Prelims</a>`;
  if (evt.youtube_url) h += `<a class="recent-event-p youtube" href="${escHtml(evt.youtube_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  if (evt.netflix_url) h += `<a class="recent-event-p netflix" href="${escHtml(evt.netflix_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  if (evt.pluto_url) h += `<a class="recent-event-p pluto" href="${escHtml(evt.pluto_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Full event</a>`;
  return h;
}

function eventWatchBtn(evt) {
  let h = '';
  if (evt.paramount_url) h += `<a class="btn btn-paramount btn-sm" href="${escHtml(evt.paramount_url)}" target="_blank" rel="noopener">▶ Watch on Paramount+</a>`;
  if (evt.espn_url) h += `<a class="btn btn-paramount btn-sm espn" href="${escHtml(evt.espn_url)}" target="_blank" rel="noopener">▶ Watch on ESPN</a>`;
  if (evt.espn_prelims_url) h += `<a class="btn btn-paramount btn-sm espn" href="${escHtml(evt.espn_prelims_url)}" target="_blank" rel="noopener">▶ Prelims on ESPN</a>`;
  if (evt.fightpass_url) h += `<a class="btn btn-fightpass btn-sm" href="${escHtml(evt.fightpass_url)}" target="_blank" rel="noopener">▶ Watch on Fight Pass</a>`;
  if (evt.fightpass_prelims_url) h += `<a class="btn btn-fightpass btn-sm" href="${escHtml(evt.fightpass_prelims_url)}" target="_blank" rel="noopener">▶ Prelims on Fight Pass</a>`;
  if (evt.youtube_url) h += `<a class="btn btn-youtube btn-sm" href="${escHtml(evt.youtube_url)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>`;
  if (evt.netflix_url) h += `<a class="btn btn-netflix btn-sm" href="${escHtml(evt.netflix_url)}" target="_blank" rel="noopener">▶ Watch on Netflix</a>`;
  if (evt.pluto_url) h += `<a class="btn btn-pluto btn-sm" href="${escHtml(evt.pluto_url)}" target="_blank" rel="noopener">▶ Watch on Pluto TV</a>`;
  return h;
}

function eventHasVideo(evt) {
  return !!(evt && (evt.paramount_url || evt.espn_url || evt.espn_prelims_url || evt.fightpass_url || evt.fightpass_prelims_url || evt.youtube_url || evt.netflix_url || evt.pluto_url));
}

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

// "2026-08-02" → "Aug 2, 2026"; anything unparseable falls through unchanged
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Top N methods with the long tail rolled into "Other" — the raw data has dozens of
// near-duplicate method strings that turned the chart legends into a wall of chips
function groupMethodCounts(labels, counts, top) {
  top = top || 6;
  const pairs = labels.map((l, i) => [l, counts[i]]).sort((a, b) => b[1] - a[1]);
  if (pairs.length <= top + 1) return { labels: pairs.map(p => p[0]), counts: pairs.map(p => p[1]) };
  const head = pairs.filter(p => p[0] !== 'Other').slice(0, top);
  const headSet = new Set(head);
  const other = pairs.reduce((a, p) => headSet.has(p) ? a : a + p[1], 0);
  return { labels: head.map(p => p[0]).concat('Other'), counts: head.map(p => p[1]).concat(other) };
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
