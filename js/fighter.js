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

  const { data, error } = await sb
    .from('fight_search')
    .select('*')
    .or(`fighter1_id.eq.${fighter.id},fighter2_id.eq.${fighter.id}`)
    .order('event_date', { ascending: false });

  if (error) { showToast('Error loading fights: ' + error.message); return; }

  currentFighterFights = data || [];
  renderFighterCard();
}

function renderFighterCard() {
  const el    = document.getElementById('fighter-card');
  const rated = currentFighterFights.filter(f => myRatings.some(r => r.fight_id === f.id)).length;

  el.innerHTML = `
    <div class="card" style="margin-bottom:0">
      <div class="event-header">
        <div>
          <div class="event-header-left">
            <button class="btn btn-outline btn-sm" onclick="closeFighterCard()">← Back</button>
            <span class="event-title">${escHtml(currentFighter.name)}</span>
          </div>
          <div class="event-meta">
            <span>${currentFighterFights.length} fight${currentFighterFights.length !== 1 ? 's' : ''} in database</span>
          </div>
        </div>
        <span class="event-progress" id="fighter-progress">${rated} / ${currentFighterFights.length} rated</span>
      </div>
      <div class="event-fights">
        ${currentFighterFights.length
          ? currentFighterFights.map(f => renderFightRow(f, { showEvent: true })).join('')
          : '<div class="empty">No fights found for this fighter.</div>'}
      </div>
    </div>`;

  el.style.display = 'block';
  document.getElementById('fighter-search-card').style.display = 'none';
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
    .or(`fighter1_id.eq.${currentFighter.id},fighter2_id.eq.${currentFighter.id}`)
    .order('event_date', { ascending: false });
  if (data) {
    currentFighterFights = data;
    renderFighterCard();
  }
}

function closeFighterCard() {
  document.getElementById('fighter-card').style.display = 'none';
  document.getElementById('fighter-search-card').style.display = 'block';
  document.getElementById('fighter-page-search').value = '';
  currentFighter = null;
  currentFighterFights = [];
}
