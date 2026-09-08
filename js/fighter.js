// ── Fighter Page ──────────────────────────────────────────────────────────────

let currentFighter = null;
let currentFighterFights = [];
let fighterPageAcIdx = -1, fighterPageAcResults = [];
let fighterPageSearchTimer = null;

// ── Fighter Autocomplete ──────────────────────────────────────────────────────

function fighterPageSearch() {
  clearTimeout(fighterPageSearchTimer);
  fighterPageSearchTimer = setTimeout(doFighterPageSearch, 300);
}

async function doFighterPageSearch() {
  const q  = document.getElementById('fighter-page-search').value.trim();
  const ac = document.getElementById('fighter-page-ac');
  fighterPageAcIdx = -1;
  if (q.length < 2) { ac.style.display = 'none'; return; }

  const { data, error } = await sb.from('fighters')
    .select('id, name')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(12);

  if (error || !data?.length) { ac.style.display = 'none'; fighterPageAcResults = []; return; }

  fighterPageAcResults = data;
  const ql = q.toLowerCase();
  ac.innerHTML = data.map((f, i) =>
    `<div class="ac-item" onmousedown="fighterPageAcPick(event,${i})">${hl(f.name, ql)}</div>`
  ).join('');
  ac.style.display = 'block';
}

function fighterPageSearchKey(e) {
  const ac    = document.getElementById('fighter-page-ac');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length || ac.style.display === 'none') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); fighterPageAcIdx = Math.min(fighterPageAcIdx+1, items.length-1); items.forEach((el,i) => el.classList.toggle('focused', i===fighterPageAcIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); fighterPageAcIdx = Math.max(0, fighterPageAcIdx-1); items.forEach((el,i) => el.classList.toggle('focused', i===fighterPageAcIdx)); }
  else if (e.key === 'Enter') { if (fighterPageAcIdx >= 0) { e.preventDefault(); selectFighterForPage(fighterPageAcResults[fighterPageAcIdx]); } ac.style.display = 'none'; }
  else if (e.key === 'Escape') { ac.style.display = 'none'; }
}

function fighterPageBlur() { setTimeout(() => { document.getElementById('fighter-page-ac').style.display = 'none'; }, 150); }
function fighterPageAcPick(e, i) { e.preventDefault(); selectFighterForPage(fighterPageAcResults[i]); }

// ── Fighter Card ──────────────────────────────────────────────────────────────

async function selectFighterForPage(fighter) {
  currentFighter = fighter;
  fighterPageAcResults = [];
  document.getElementById('fighter-page-search').value = fighter.name;
  document.getElementById('fighter-page-ac').style.display = 'none';
  showCardLoading('fighter-card', 'fighter-search-card', `Loading ${fighter.name}…`);

  // Callers pass only { id, name } (autocomplete, navToFighter, nav-return
  // context), so pull the full row for the profile header alongside the fights.
  const [profile, { data, error }] = await Promise.all([
    sb.from('fighters').select('*').eq('id', fighter.id).single(),
    sb.from('fight_search')
      .select('*')
      .not('is_amateur', 'is', true)
      .or(`fighter1_id.eq.${fighter.id},fighter2_id.eq.${fighter.id}`)
      .order('event_date', { ascending: false })
  ]);

  if (currentFighter && currentFighter.id !== fighter.id) return; // moved on to another fighter
  if (error) {
    restoreCardSearch('fighter-card', 'fighter-search-card');
    showToast('Error loading fights: ' + error.message);
    return;
  }

  if (profile.data) currentFighter = profile.data;
  currentFighterFights = sortFighterFights(data || []);
  renderFighterCard();
}

// Summary stats for the current fighter, computed only from the user's rated
// fights — mirrors getFighterRecord's convention so we never reveal the outcome
// of a fight the user hasn't watched/rated yet.
function fighterSummaryStats() {
  let w = 0, l = 0, d = 0, finishW = 0, decW = 0;
  const ratings = [];
  currentFighterFights.forEach(f => {
    const r = myRatings.find(x => x.fight_id === f.id && x.rating);
    if (!r) return;
    ratings.push(r.rating);
    const ml = (f.method || '').toLowerCase();
    if (f.winner_name === currentFighter.name) {
      w++;
      if (ml.includes('ko') || ml.includes('tko') || ml.includes('submission') || ml.includes('sub')) finishW++;
      else if (ml.includes('decision') || ml.includes('dec')) decW++;
    } else if (f.winner_name) {
      l++;
    } else {
      d++;
    }
  });
  return {
    rated: ratings.length, w, l, d, finishW, decW,
    avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  };
}

// Sherdog nationality strings → ISO 3166 codes for flagcdn.com images.
// Flag EMOJI are deliberately not used: Windows ships no flag glyphs, so
// Chromium there renders them as bare letter pairs ("NZ"). Exact-match only —
// an unmapped value renders without a flag. Covers every value currently in
// the fighters table plus likely neighbours.
const NATIONALITY_ISO = {
  'United States':'us','USA':'us','Japan':'jp','Brazil':'br','Italy':'it','Canada':'ca',
  'England':'gb-eng','Scotland':'gb-sct','Wales':'gb-wls',
  'China':'cn','Australia':'au','Mexico':'mx','New Zealand':'nz','Russia':'ru','Netherlands':'nl',
  'Poland':'pl','South Korea':'kr','Germany':'de','Philippines':'ph','Peru':'pe','Sweden':'se',
  'Jamaica':'jm','Jordan':'jo','France':'fr','Ireland':'ie','Denmark':'dk','Turkey':'tr',
  'Cuba':'cu','Belgium':'be','Ukraine':'ua','Argentina':'ar','Nigeria':'ng','Romania':'ro',
  'Bulgaria':'bg','Croatia':'hr','Morocco':'ma','Saudi Arabia':'sa','Myanmar':'mm','South Africa':'za',
  'Indonesia':'id','Kyrgyzstan':'kg','Algeria':'dz','El Salvador':'sv','Venezuela':'ve','Samoa':'ws',
  'Czech Republic':'cz','Czechia':'cz','Dominican Republic':'do','Singapore':'sg','Uzbekistan':'uz','Portugal':'pt',
  'Ghana':'gh','Malaysia':'my','Bosnia and Herzegovina':'ba','Tajikistan':'tj','Belarus':'by','Paraguay':'py',
  'Angola':'ao','United Arab Emirates':'ae','Georgia':'ge','Burundi':'bi','Congo, The Democratic Republic of the':'cd',
  'Afghanistan':'af','Puerto Rico':'pr','Iran':'ir','Chile':'cl','Suriname':'sr','Iraq':'iq',
  'Switzerland':'ch','Ecuador':'ec','Ethiopia':'et','South Sudan':'ss','Lithuania':'lt','Moldova':'md',
  'Costa Rica':'cr','Spain':'es','Norway':'no','Finland':'fi','Austria':'at','Greece':'gr',
  'Thailand':'th','India':'in','Pakistan':'pk','Israel':'il','Egypt':'eg','Colombia':'co',
  'Bolivia':'bo','Uruguay':'uy','Guatemala':'gt','Honduras':'hn','Nicaragua':'ni','Panama':'pa',
  'Haiti':'ht','Kazakhstan':'kz','Armenia':'am','Azerbaijan':'az','Mongolia':'mn','Vietnam':'vn',
  'Cameroon':'cm','Senegal':'sn','Kenya':'ke','Zimbabwe':'zw','Serbia':'rs','Slovakia':'sk',
  'Slovenia':'si','Hungary':'hu','Latvia':'lv','Estonia':'ee','Iceland':'is','Cambodia':'kh'
};

// fighters.id IS the Sherdog fighter id, and /fighter/<id> redirects to the
// canonical slug URL — no stored link needed.
function sherdogFighterUrl(id) { return `https://www.sherdog.com/fighter/${id}`; }

function fighterInitials(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}

function fighterAge(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

// Sherdog 403s hotlinked images when a Referer is sent, so the img must be
// no-referrer. Photos are missing for plenty of regional fighters (and for any
// fighter fighter_profile_scraper.py hasn't reached yet) — the initials sit
// underneath, so a dropped img just uncovers them.
function renderFighterPhoto() {
  const initials = `<span class="fighter-photo-initials">${escHtml(fighterInitials(currentFighter.name))}</span>`;
  // alt is empty on purpose: the name is already in the header beside this box,
  // and a non-empty alt paints itself over the initials while a 403 is in flight.
  const img = currentFighter.image_url
    ? `<img src="${escHtml(currentFighter.image_url)}" alt=""
            referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`
    : '';
  return `<div class="fighter-photo">${initials}${img}</div>`;
}

function renderFighterBio() {
  const age  = fighterAge(currentFighter.date_of_birth);
  const iso  = NATIONALITY_ISO[currentFighter.nationality] || '';
  // h24 PNG shown at 12px — crisp on 2x displays. onerror drops the img so an
  // offline/blocked CDN just leaves the plain text pill.
  const flag = iso ? `<img class="bio-flag" src="https://flagcdn.com/h24/${iso}.png" alt="" onerror="this.remove()">` : '';
  const bits = []; // [title, innerHtml] — innerHtml is pre-escaped below
  if (currentFighter.nationality)
    bits.push(['Nationality', `${flag}${escHtml(currentFighter.nationality)}`]);
  if (age !== null)
    bits.push([`Born ${currentFighter.date_of_birth}`, `${age} yrs`]);
  if (currentFighter.height)
    bits.push(['Height', escHtml(currentFighter.height)]);
  // "Team" gets a visible inline label, not just a title: bare association
  // values like "Alive" or "Freelance" are unreadable next to a height.
  if (currentFighter.association)
    bits.push(['Team', `<span class="bio-label">Team</span>${escHtml(currentFighter.association)}`]);
  if (!bits.length) return '';
  return `<div class="fighter-bio">${bits.map(([title, html]) =>
    `<span title="${escHtml(title)}">${html}</span>`).join('')}</div>`;
}

// Non-spoiler career context derived from the fight list itself — years active
// and the division most fought in. No outcomes involved, so nothing is revealed
// about fights the user hasn't rated yet.
function fighterCareerBits() {
  const bits  = [];
  const years = currentFighterFights
    .map(f => f.event_date ? parseInt(f.event_date.slice(0, 4), 10) : NaN)
    .filter(y => !isNaN(y));
  if (years.length) {
    const lo = Math.min(...years), hi = Math.max(...years);
    bits.push(lo === hi ? `Active ${lo}` : `Active ${lo}–${hi}`);
  }
  const wcCount = {};
  currentFighterFights.forEach(f => {
    if (f.weight_class) wcCount[f.weight_class] = (wcCount[f.weight_class] || 0) + 1;
  });
  const wcs = Object.entries(wcCount).sort((a, b) => b[1] - a[1]);
  if (wcs.length) bits.push(wcs.length > 1 ? `Mostly ${wcs[0][0]}` : wcs[0][0]);
  return bits;
}

// Every org the fighter has fought for, most fights first, rendered with the
// same orgBadge() used on event rows (logo when registered, text otherwise).
function renderFighterOrgs() {
  const count = {};
  currentFighterFights.forEach(f => {
    if (f.event_organization) count[f.event_organization] = (count[f.event_organization] || 0) + 1;
  });
  const orgs = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (!orgs.length) return '';
  // Fold the fight count into the badge's own title ("Pancrase — 12 fights") —
  // a wrapper span's title would be shadowed by orgBadge's. Text-only badges
  // have no title attribute, so the replace is a no-op there; the name shows.
  return `<div class="fighter-orgs">${orgs.map(([org, n]) =>
    orgBadge(org).replace(`title="${escHtml(org)}"`,
      `title="${escHtml(`${org} — ${n} fight${n !== 1 ? 's' : ''}`)}"`)).join('')}</div>`;
}

function renderFighterCard() {
  const el    = document.getElementById('fighter-card');
  const rated = currentFighterFights.filter(f => myRatings.some(r => r.fight_id === f.id)).length;

  const s = fighterSummaryStats();
  // Tiles render whenever the fighter has fights — with placeholders until
  // something is rated — so the records column is present from the start
  // rather than popping into existence at the first rating.
  const statsStrip = currentFighterFights.length ? `
      <div class="fighter-stats-strip">
        <div class="fstat"><div class="fstat-label">Your Record</div><div class="fstat-value">${s.rated ? `${s.w}-${s.l}${s.d ? '-' + s.d : ''}` : '—'}</div></div>
        <div class="fstat"><div class="fstat-label">Finishes</div><div class="fstat-value">${s.rated ? s.finishW : '—'}</div></div>
        <div class="fstat"><div class="fstat-label">Decisions</div><div class="fstat-value">${s.rated ? s.decW : '—'}</div></div>
        <div class="fstat"><div class="fstat-label">Your Avg Rating</div><div class="fstat-value">${s.avg ? s.avg.toFixed(1) + ' <span class="fstat-star">★</span>' : '—'}</div></div>
      </div>` : '';

  // Pin upcoming bouts in their own section above the history, soonest first,
  // instead of leaving them inline at the top of the reverse-chron list. Same
  // date test renderFightRow uses for its Upcoming tag, so the two agree.
  const todayTs  = new Date().setHours(0, 0, 0, 0);
  const upcoming = currentFighterFights
    .filter(f => f.event_date && eventDateTs(f.event_date) > todayTs)
    .sort((a, b) => eventDateTs(a.event_date) - eventDateTs(b.event_date));
  const past = currentFighterFights.filter(f => !upcoming.includes(f));
  const row  = f => renderFightRow(f, { showEvent: true, perspective: currentFighter.name });

  el.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <div class="fighter-page-grid">
        <aside class="fighter-side">
          <button class="btn btn-outline btn-sm" onclick="closeFighterCard()">← ${navReturnContext && navReturnContext.type === 'event' ? escHtml(navReturnContext.data.name) : 'Back'}</button>
          ${renderFighterPhoto()}
          <span class="event-title">${escHtml(currentFighter.name)}</span>
          ${renderFighterBio()}
          <div class="event-meta">
            ${fighterCareerBits().map(b => `<span>${escHtml(b)}</span>`).join('')}
            <a class="sherdog-link" href="${sherdogFighterUrl(currentFighter.id)}" target="_blank" rel="noopener noreferrer">Sherdog ↗</a>
          </div>
          ${renderFighterOrgs()}
          <span class="event-progress" id="fighter-progress">${rated} / ${currentFighterFights.length} rated</span>
          ${statsStrip}
        </aside>
        <div class="event-fights">
          ${upcoming.length ? `<div class="fights-subhead">Upcoming</div>${upcoming.map(row).join('')}` : ''}
          ${upcoming.length && past.length ? '<div class="fights-subhead">Fight History</div>' : ''}
          ${past.length
            ? past.map(row).join('')
            : upcoming.length ? '' : '<div class="empty">No fights found for this fighter.</div>'}
        </div>
      </div>
    </div>`;

  el.style.display = 'block';
  document.getElementById('fighter-search-card').style.display = 'none';

  // Clear the event card's DOM — both cards give fight rows per-fight element
  // ids, and a duplicate id would hijack star/notes updates for shared fights.
  // showView re-renders it from currentEvent when the user returns to the tab.
  const ec = document.getElementById('event-card');
  if (ec) { ec.innerHTML = ''; ec.style.display = 'none'; }
  const esc = document.getElementById('event-search-card');
  if (esc) esc.style.display = 'block';
}

function updateFighterProgress() {
  const el = document.getElementById('fighter-progress');
  if (!el) return;
  const rated = currentFighterFights.filter(f => myRatings.some(r => r.fight_id === f.id)).length;
  el.textContent = `${rated} / ${currentFighterFights.length} rated`;
}

async function reloadFighterFights() {
  if (!currentFighter) return;
  const { data } = await sb
    .from('fight_search')
    .select('*')
    .not('is_amateur', 'is', true)
    .or(`fighter1_id.eq.${currentFighter.id},fighter2_id.eq.${currentFighter.id}`)
    .order('event_date', { ascending: false });
  if (data) {
    currentFighterFights = sortFighterFights(data);
    renderFighterCard();
  }
}

function sortFighterFights(fights) {
  return fights.slice().sort((a, b) => {
    const da = a.event_date ? new Date(a.event_date).getTime() : 0;
    const db = b.event_date ? new Date(b.event_date).getTime() : 0;
    return db - da; // descending — most recent first
  });
}

function closeFighterCard() {
  if (navReturnContext && navReturnContext.type === 'event') {
    const ctx = navReturnContext;
    navReturnContext = null;
    currentFighter = null;
    currentFighterFights = [];
    activateView('view-log');
    selectEvent(ctx.data);
    return;
  }
  document.getElementById('fighter-card').style.display = 'none';
  document.getElementById('fighter-search-card').style.display = 'block';
  document.getElementById('fighter-page-search').value = '';
  currentFighter = null;
  currentFighterFights = [];
  navReturnContext = null;
}
