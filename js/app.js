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

// ── Aggregate ratings (community avg) ─────────────────────────────────────────
let fightAggregates = new Map(); // fight_id → { avg, count }

async function loadFightAggregates() {
  const { data, error } = await sb.rpc('fight_rating_stats');
  if (error || !data) { fightAggregates = new Map(); return; }
  fightAggregates = new Map(data.map(r => [r.fight_id, { avg: Number(r.avg_rating), count: Number(r.rating_count) }]));
}

// ── Shared state ──────────────────────────────────────────────────────────────
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
  if (typeof renderRecentEventsList === 'function') renderRecentEventsList();
}

async function enterApp() {
  hideAuthScreen();
  updateAuthUI();
  await loadRatings();
  renderTable();
  if (typeof renderRecentEventsList === 'function') renderRecentEventsList();
  if (currentEvent) renderEventCard();
  if (currentFighter) renderFighterCard();
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

// Map an org name to its logo file in img/logos/. Add an entry here once the file exists.
const ORG_LOGOS = {
  'UFC':             'ufc.png',
  'PFL':             'pfl.png',
  'WEC':             'wec.png',
  'PRIDE':           'pride.png',
  'Pancrase':        'pancrase.svg',
  'Shooto':          'shooto.svg',
  'King of the Cage':'kingofthecage.svg',
  'EliteXC':         'elitexc.svg',
  'Bellator':        'bellator.svg',
  'Cage Warriors':   'cagewarriors.svg',
  'LFA':             'lfa.svg',
  'CFFC':            'cffc.svg',
  'Fury FC':         'furyfc.svg',
  'Titan FC':        'titanfc.svg',
  'Invicta FC':      'invictafc.svg',
  'Strikeforce':     'strikeforce.svg',
  'WSOF':            'wsof.svg',
  'RIZIN':           'rizin.svg',
  'DWCS':            'dwcs.svg',
  'Road to UFC':     'roadtoufc.svg',
  'Vale Tudo Japan': 'valetudojapan.svg',
  'Affliction':      'affliction.svg',
  'MVP':             'mvp.svg',
};

function orgBadge(org) {
  if (!org) return '';
  const slug = org.toLowerCase().replace(/[^a-z0-9]/g, '');
  const file = ORG_LOGOS[org];
  if (file) {
    return `<span class="org-badge org-${slug} has-logo" title="${escHtml(org)}"><img src="img/logos/${file}" alt="${escHtml(org)}"></span>`;
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
  return h;
}

function eventHasVideo(evt) {
  return !!(evt && (evt.paramount_url || evt.espn_url || evt.espn_prelims_url || evt.fightpass_url || evt.fightpass_prelims_url || evt.youtube_url || evt.netflix_url));
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
