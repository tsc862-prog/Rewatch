// ── Admin Panel ───────────────────────────────────────────────────────────────

let adminSearchTimers = {};
let adminFightEventId = null;
let adminFightF1Id = null;
let adminFightF2Id = null;
let adminResultFight = null; // selected fight for result editing

function showAdminTab(tab, e) {
  document.querySelectorAll('.admin-panel').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active');
  if (e && e.target) e.target.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

async function adminAddEvent() {
  const name = document.getElementById('admin-event-name').value.trim();
  const date = document.getElementById('admin-event-date').value.trim();
  const location = document.getElementById('admin-event-location').value.trim();
  if (!name) { showToast('Event name is required'); return; }

  const { error } = await sb.from('events').insert({
    name, date: date || null, location: location || null
  });
  if (error) { showToast('Error: ' + error.message); return; }

  document.getElementById('admin-event-name').value = '';
  document.getElementById('admin-event-date').value = '';
  document.getElementById('admin-event-location').value = '';
  showToast('Event added');
}

function adminSearchEvents() {
  clearTimeout(adminSearchTimers.events);
  adminSearchTimers.events = setTimeout(doAdminSearchEvents, 300);
}

async function doAdminSearchEvents() {
  const q = document.getElementById('admin-event-search').value.trim();
  const el = document.getElementById('admin-event-results');
  if (q.length < 2) { el.innerHTML = ''; return; }

  const { data, error } = await sb.from('events').select('*')
    .ilike('name', `%${q}%`).order('date', { ascending: false }).limit(20);
  if (error || !data?.length) { el.innerHTML = '<div class="empty">No events found.</div>'; return; }

  el.innerHTML = data.map(evt => `
    <div class="admin-row" id="admin-event-${evt.id}">
      <div class="admin-row-main">
        <strong>${escHtml(evt.name)}</strong>
        <span class="admin-row-meta">${evt.date || '—'} · ${evt.location || '—'}</span>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-outline btn-sm" onclick="adminEditEvent('${evt.id}')">Edit</button>
        <button class="btn-danger" onclick="adminDeleteEvent('${evt.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

async function adminEditEvent(id) {
  const row = document.getElementById('admin-event-' + id);
  const { data } = await sb.from('events').select('*').eq('id', id).single();
  if (!data) return;

  row.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1">
      <input type="text" id="edit-event-name-${id}" value="${escHtml(data.name)}" class="admin-input" style="flex:2;min-width:180px">
      <input type="text" id="edit-event-date-${id}" value="${escHtml(data.date||'')}" class="admin-input" placeholder="Date" style="flex:1;min-width:100px">
      <input type="text" id="edit-event-loc-${id}" value="${escHtml(data.location||'')}" class="admin-input" placeholder="Location" style="flex:1;min-width:120px">
      <button class="btn btn-red btn-sm" onclick="adminSaveEvent('${id}')">Save</button>
      <button class="btn btn-outline btn-sm" onclick="doAdminSearchEvents()">Cancel</button>
    </div>`;
}

async function adminSaveEvent(id) {
  const name = document.getElementById('edit-event-name-' + id).value.trim();
  const date = document.getElementById('edit-event-date-' + id).value.trim();
  const location = document.getElementById('edit-event-loc-' + id).value.trim();
  if (!name) { showToast('Name is required'); return; }

  const { error } = await sb.from('events').update({
    name, date: date || null, location: location || null
  }).eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }

  showToast('Event updated');
  doAdminSearchEvents();
}

async function adminDeleteEvent(id) {
  if (!confirm('Delete this event? This will fail if fights reference it.')) return;
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }
  showToast('Event deleted');
  doAdminSearchEvents();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGHTERS
// ═══════════════════════════════════════════════════════════════════════════════

async function adminAddFighter() {
  const name = document.getElementById('admin-fighter-name').value.trim();
  if (!name) { showToast('Fighter name is required'); return; }

  const { error } = await sb.from('fighters').insert({ name });
  if (error) { showToast('Error: ' + error.message); return; }

  document.getElementById('admin-fighter-name').value = '';
  showToast('Fighter added');
}

function adminSearchFighters() {
  clearTimeout(adminSearchTimers.fighters);
  adminSearchTimers.fighters = setTimeout(doAdminSearchFighters, 300);
}

async function doAdminSearchFighters() {
  const q = document.getElementById('admin-fighter-search').value.trim();
  const el = document.getElementById('admin-fighter-results');
  if (q.length < 2) { el.innerHTML = ''; return; }

  const { data, error } = await sb.from('fighters').select('*')
    .ilike('name', `%${q}%`).order('name').limit(20);
  if (error || !data?.length) { el.innerHTML = '<div class="empty">No fighters found.</div>'; return; }

  el.innerHTML = data.map(f => `
    <div class="admin-row" id="admin-fighter-${f.id}">
      <div class="admin-row-main"><strong>${escHtml(f.name)}</strong></div>
      <div class="admin-row-actions">
        <button class="btn btn-outline btn-sm" onclick="adminEditFighter('${f.id}')">Edit</button>
        <button class="btn-danger" onclick="adminDeleteFighter('${f.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

async function adminEditFighter(id) {
  const row = document.getElementById('admin-fighter-' + id);
  const { data } = await sb.from('fighters').select('*').eq('id', id).single();
  if (!data) return;

  row.innerHTML = `
    <div style="display:flex;gap:8px;flex:1">
      <input type="text" id="edit-fighter-name-${id}" value="${escHtml(data.name)}" class="admin-input" style="flex:1">
      <button class="btn btn-red btn-sm" onclick="adminSaveFighter('${id}')">Save</button>
      <button class="btn btn-outline btn-sm" onclick="doAdminSearchFighters()">Cancel</button>
    </div>`;
}

async function adminSaveFighter(id) {
  const name = document.getElementById('edit-fighter-name-' + id).value.trim();
  if (!name) { showToast('Name is required'); return; }

  const { error } = await sb.from('fighters').update({ name }).eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }

  showToast('Fighter updated');
  doAdminSearchFighters();
}

async function adminDeleteFighter(id) {
  if (!confirm('Delete this fighter? This will fail if fights reference them.')) return;
  const { error } = await sb.from('fighters').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }
  showToast('Fighter deleted');
  doAdminSearchFighters();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGHTS — Add
// ═══════════════════════════════════════════════════════════════════════════════

function adminFightEventSearch() {
  clearTimeout(adminSearchTimers.fightEvent);
  adminSearchTimers.fightEvent = setTimeout(doAdminFightEventSearch, 300);
}

async function doAdminFightEventSearch() {
  const q = document.getElementById('admin-fight-event').value.trim();
  const ac = document.getElementById('admin-fight-event-ac');
  adminEventAcState.idx = -1;
  if (q.length < 2) { ac.style.display = 'none'; adminEventAcState.results = []; return; }

  const { data } = await sb.from('events').select('*')
    .ilike('name', `%${q}%`).order('date', { ascending: false }).limit(8);
  if (!data?.length) { ac.style.display = 'none'; adminEventAcState.results = []; return; }

  adminEventAcState.results = data;
  ac.innerHTML = data.map((evt, i) =>
    `<div class="ac-item" data-idx="${i}" onmousedown="adminPickFightEvent('${evt.id}','${escHtml(evt.name)}')">${escHtml(evt.name)} <span class="ac-meta">${evt.date||''}</span></div>`
  ).join('');
  ac.style.display = 'block';
}

let adminEventAcState = { idx: -1, results: [] };

function adminFightEventKey(e) {
  const ac = document.getElementById('admin-fight-event-ac');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length || ac.style.display === 'none') return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    adminEventAcState.idx = Math.min(adminEventAcState.idx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('focused', i === adminEventAcState.idx));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    adminEventAcState.idx = Math.max(0, adminEventAcState.idx - 1);
    items.forEach((el, i) => el.classList.toggle('focused', i === adminEventAcState.idx));
  } else if ((e.key === 'Enter' || e.key === 'Tab') && adminEventAcState.idx >= 0) {
    e.preventDefault();
    const evt = adminEventAcState.results[adminEventAcState.idx];
    if (evt) adminPickFightEvent(evt.id, evt.name);
    ac.style.display = 'none';
  } else if (e.key === 'Escape') {
    ac.style.display = 'none';
  }
}

function adminPickFightEvent(id, name) {
  adminFightEventId = id;
  document.getElementById('admin-fight-event').value = name;
  document.getElementById('admin-fight-event-ac').style.display = 'none';
  adminEventAcState.idx = -1;
}

let adminFighterAcState = { f1: { idx: -1, results: [] }, f2: { idx: -1, results: [] } };

function adminFightFighterSearch(which) {
  // Reset selected ID when user types (they're changing the value)
  if (which === 'f1') adminFightF1Id = null;
  else adminFightF2Id = null;
  clearTimeout(adminSearchTimers['fight'+which]);
  adminSearchTimers['fight'+which] = setTimeout(() => doAdminFightFighterSearch(which), 300);
}

async function doAdminFightFighterSearch(which) {
  const q = document.getElementById('admin-fight-' + which).value.trim();
  const ac = document.getElementById('admin-fight-' + which + '-ac');
  const state = adminFighterAcState[which];
  state.idx = -1;
  if (q.length < 2) { ac.style.display = 'none'; state.results = []; return; }

  const { data } = await sb.from('fighters').select('*')
    .ilike('name', `%${q}%`).order('name').limit(8);

  state.results = data || [];

  // Check if typed name exactly matches any result
  const exactMatch = state.results.some(f => f.name.toLowerCase() === q.toLowerCase());

  let html = state.results.map((f, i) =>
    `<div class="ac-item" data-idx="${i}" onmousedown="adminPickFighter('${which}','${f.id}','${escHtml(f.name)}')">${escHtml(f.name)}</div>`
  ).join('');

  // Add "create new" option if no exact match
  if (!exactMatch && q.length >= 2) {
    html += `<div class="ac-item ac-create" data-idx="${state.results.length}" onmousedown="adminCreateAndPickFighter('${which}')"><strong>+ Create "${escHtml(q)}"</strong></div>`;
  }

  ac.innerHTML = html;
  ac.style.display = 'block';
}

function adminFighterSearchKey(e, which) {
  const ac = document.getElementById('admin-fight-' + which + '-ac');
  const items = ac.querySelectorAll('.ac-item');
  const state = adminFighterAcState[which];
  if (!items.length || ac.style.display === 'none') return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.idx = Math.min(state.idx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('focused', i === state.idx));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.idx = Math.max(0, state.idx - 1);
    items.forEach((el, i) => el.classList.toggle('focused', i === state.idx));
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (state.idx >= 0) {
      e.preventDefault();
      if (state.idx < state.results.length) {
        const f = state.results[state.idx];
        adminPickFighter(which, f.id, f.name);
      } else if (state.idx === state.results.length) {
        adminCreateAndPickFighter(which);
      }
      ac.style.display = 'none';
    }
  } else if (e.key === 'Escape') {
    ac.style.display = 'none';
  }
}

function adminPickFighter(which, id, name) {
  if (which === 'f1') adminFightF1Id = id;
  else adminFightF2Id = id;
  document.getElementById('admin-fight-' + which).value = name;
  document.getElementById('admin-fight-' + which + '-ac').style.display = 'none';
  adminFighterAcState[which].idx = -1;
}

async function adminCreateAndPickFighter(which) {
  const input = document.getElementById('admin-fight-' + which);
  const name = input.value.trim();
  if (!name) return;

  const { data, error } = await sb.from('fighters')
    .insert({ name })
    .select('id, name')
    .single();

  if (error) { showToast('Error creating fighter: ' + error.message); return; }

  adminPickFighter(which, data.id, data.name);
  showToast('Fighter "' + data.name + '" created');
}

async function adminAddFight() {
  if (!adminFightEventId) { showToast('Select an event'); return; }

  // Auto-create fighters if typed but not selected from dropdown
  for (const which of ['f1', 'f2']) {
    const id = which === 'f1' ? adminFightF1Id : adminFightF2Id;
    if (!id) {
      const name = document.getElementById('admin-fight-' + which).value.trim();
      if (!name) { showToast('Select or enter both fighters'); return; }
      await adminCreateAndPickFighter(which);
    }
  }

  if (!adminFightF1Id || !adminFightF2Id) { showToast('Could not resolve fighters'); return; }
  if (adminFightF1Id === adminFightF2Id) { showToast('Fighters must be different'); return; }

  const wc = document.getElementById('admin-fight-wc').value || null;
  const isTitle = document.getElementById('admin-fight-title').checked;
  const posType = document.getElementById('admin-fight-pos-type').value || null;
  const isMain = posType === 'Main Event';
  const f1Rank = document.getElementById('admin-fight-f1-rank').value.trim() || null;
  const f2Rank = document.getElementById('admin-fight-f2-rank').value.trim() || null;
  const fightNotes = document.getElementById('admin-fight-notes').value.trim() || null;

  // Auto-assign fight_position: next position for this event
  const { data: maxPos } = await sb.from('fights')
    .select('fight_position')
    .eq('event_id', adminFightEventId)
    .order('fight_position', { ascending: false, nullsFirst: false })
    .limit(1);
  const nextPos = (maxPos?.length && maxPos[0].fight_position != null) ? maxPos[0].fight_position + 1 : 1;

  const fightId = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const { error } = await sb.from('fights').insert({
    id: fightId,
    event_id: adminFightEventId,
    fighter1_id: adminFightF1Id,
    fighter2_id: adminFightF2Id,
    weight_class: wc,
    is_main: isMain,
    is_title: isTitle,
    fight_position: nextPos,
    fight_position_type: posType,
    fighter1_rank: f1Rank,
    fighter2_rank: f2Rank,
    notes: fightNotes
  });

  if (error) { showToast('Error: ' + error.message); return; }

  // Clear form (keep event + division + position type selected)
  document.getElementById('admin-fight-f1').value = '';
  document.getElementById('admin-fight-f2').value = '';
  document.getElementById('admin-fight-title').checked = false;
  document.getElementById('admin-fight-f1-rank').value = '';
  document.getElementById('admin-fight-f2-rank').value = '';
  document.getElementById('admin-fight-notes').value = '';
  adminFightF1Id = null;
  adminFightF2Id = null;
  document.getElementById('admin-fight-f1').focus();
  showToast('Fight added');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGHTS — Search / Edit / Delete
// ═══════════════════════════════════════════════════════════════════════════════

function adminSearchFights() {
  clearTimeout(adminSearchTimers.fights);
  adminSearchTimers.fights = setTimeout(doAdminSearchFights, 300);
}

async function doAdminSearchFights() {
  const q = document.getElementById('admin-fight-search').value.trim();
  const el = document.getElementById('admin-fight-results');
  if (q.length < 2) { el.innerHTML = ''; return; }

  const { data, error } = await sb.from('fight_search').select('*')
    .or(`fighter1_name.ilike.%${q}%,fighter2_name.ilike.%${q}%,event_name.ilike.%${q}%`)
    .limit(20);
  if (error || !data?.length) { el.innerHTML = '<div class="empty">No fights found.</div>'; return; }

  el.innerHTML = data.map(f => `
    <div class="admin-row" id="admin-fight-${f.id}">
      <div class="admin-row-main">
        <strong>${escHtml(f.fighter1_name)} vs ${escHtml(f.fighter2_name)}</strong>
        <span class="admin-row-meta">
          ${escHtml(f.event_name||'')} · ${f.event_date||'—'} · ${f.weight_class||'—'}
          ${f.fight_position_type ? ' · <span class="pos-type-tag pos-'+slugPosType(f.fight_position_type)+'">' + escHtml(f.fight_position_type) + '</span>' : ''}
          ${f.is_title ? ' · <span class="title-tag">TITLE</span>' : ''}
          ${f.fight_position != null ? ' · #' + f.fight_position : ''}
        </span>
        ${f.winner_name ? `<span class="admin-row-meta">Result: W: ${escHtml(f.winner_name)} · ${f.method||'—'} · R${f.round||'?'} ${f.time||''}</span>` : '<span class="admin-row-meta" style="color:#bbb">No result</span>'}
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-outline btn-sm" onclick="adminEditFight('${f.id}')">Edit</button>
        <button class="btn-danger" onclick="adminDeleteFight('${f.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

async function adminEditFight(id) {
  const row = document.getElementById('admin-fight-' + id);
  const { data } = await sb.from('fights').select('*').eq('id', id).single();
  if (!data) return;

  const wcOptions = ['','Strawweight','Flyweight','Bantamweight','Featherweight','Lightweight','Welterweight','Middleweight','Light Heavyweight','Heavyweight',
    "Women's Strawweight","Women's Flyweight","Women's Bantamweight","Women's Featherweight"]
    .map(w => `<option${w===data.weight_class?' selected':''}>${w||'—'}</option>`).join('');

  const ptOptions = ['','Main Event','Main Card','Prelim']
    .map(p => `<option value="${p}"${p===data.fight_position_type?' selected':''}>${p||'—'}</option>`).join('');

  row.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1;align-items:center">
      <select id="edit-fight-wc-${id}" class="admin-input" style="min-width:130px">${wcOptions}</select>
      <select id="edit-fight-pt-${id}" class="admin-input" style="min-width:110px">${ptOptions}</select>
      <div class="form-group" style="width:60px;margin-bottom:0">
        <label style="font-size:10px">Position</label>
        <input type="number" id="edit-fight-pos-${id}" class="admin-input" min="1" value="${data.fight_position||''}" style="width:60px">
      </div>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="edit-fight-title-${id}" ${data.is_title?'checked':''}> Title</label>
      <div class="form-group" style="width:55px;margin-bottom:0">
        <label style="font-size:10px">F1 #</label>
        <input type="text" id="edit-fight-f1r-${id}" class="admin-input" value="${data.fighter1_rank||''}" placeholder="C, 1…" style="width:55px">
      </div>
      <div class="form-group" style="width:55px;margin-bottom:0">
        <label style="font-size:10px">F2 #</label>
        <input type="text" id="edit-fight-f2r-${id}" class="admin-input" value="${data.fighter2_rank||''}" placeholder="C, 1…" style="width:55px">
      </div>
      <div class="form-group" style="flex:1;min-width:100px;margin-bottom:0">
        <label style="font-size:10px">Notes</label>
        <input type="text" id="edit-fight-notes-${id}" class="admin-input" value="${escHtml(data.notes||'')}" placeholder="Catchweight…">
      </div>
      <button class="btn btn-red btn-sm" onclick="adminSaveFight('${id}')">Save</button>
      <button class="btn btn-outline btn-sm" onclick="doAdminSearchFights()">Cancel</button>
    </div>`;
}

async function adminSaveFight(id) {
  let wc = document.getElementById('edit-fight-wc-' + id).value;
  if (wc === '—') wc = null;
  const posType = document.getElementById('edit-fight-pt-' + id).value || null;
  const isMain = posType === 'Main Event';
  const isTitle = document.getElementById('edit-fight-title-' + id).checked;
  const pos = parseInt(document.getElementById('edit-fight-pos-' + id).value) || null;

  const f1Rank = document.getElementById('edit-fight-f1r-' + id).value.trim() || null;
  const f2Rank = document.getElementById('edit-fight-f2r-' + id).value.trim() || null;
  const fightNotes = document.getElementById('edit-fight-notes-' + id).value.trim() || null;

  const { error } = await sb.from('fights').update({
    weight_class: wc, is_main: isMain, is_title: isTitle,
    fight_position_type: posType, fight_position: pos,
    fighter1_rank: f1Rank, fighter2_rank: f2Rank, notes: fightNotes
  }).eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }

  showToast('Fight updated');
  doAdminSearchFights();
}

async function adminDeleteFight(id) {
  if (!confirm('Delete this fight and its result?')) return;
  // Delete result first (FK constraint)
  await sb.from('fight_results').delete().eq('fight_id', id);
  // Delete any rating
  await sb.from('ratings').delete().eq('fight_id', id);
  const { error } = await sb.from('fights').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message); return; }
  showToast('Fight deleted');
  doAdminSearchFights();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGHT RESULTS — Add / Edit
// ═══════════════════════════════════════════════════════════════════════════════

function adminResultSearch() {
  clearTimeout(adminSearchTimers.result);
  adminSearchTimers.result = setTimeout(doAdminResultSearch, 300);
}

async function doAdminResultSearch() {
  const q = document.getElementById('admin-result-search').value.trim();
  const ac = document.getElementById('admin-result-ac');
  if (q.length < 2) { ac.style.display = 'none'; return; }

  const { data } = await sb.from('fight_search').select('*')
    .or(`fighter1_name.ilike.%${q}%,fighter2_name.ilike.%${q}%,event_name.ilike.%${q}%`)
    .limit(10);
  if (!data?.length) { ac.style.display = 'none'; return; }

  ac.innerHTML = data.map((f, i) =>
    `<div class="ac-item" onmousedown="adminPickResultFight(${i})">
      <div>${escHtml(f.fighter1_name)} vs ${escHtml(f.fighter2_name)}</div>
      <div class="ac-meta">${escHtml(f.event_name||'')} · ${f.event_date||''}</div>
    </div>`
  ).join('');
  ac.style.display = 'block';
  // Stash results for picking
  adminResultSearch._results = data;
}

function adminPickResultFight(i) {
  const f = adminResultSearch._results[i];
  adminResultFight = f;
  document.getElementById('admin-result-search').value = f.fighter1_name + ' vs ' + f.fighter2_name;
  document.getElementById('admin-result-ac').style.display = 'none';

  const form = document.getElementById('admin-result-form');
  form.style.display = 'block';
  form.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px">
      <div class="form-group" style="min-width:160px;margin-bottom:0">
        <label>Winner</label>
        <select id="admin-result-winner" class="admin-input">
          <option value="">Draw / NC</option>
          <option value="${f.fighter1_id}" ${f.winner_id===f.fighter1_id?'selected':''}>${escHtml(f.fighter1_name)}</option>
          <option value="${f.fighter2_id}" ${f.winner_id===f.fighter2_id?'selected':''}>${escHtml(f.fighter2_name)}</option>
        </select>
      </div>
      <div class="form-group" style="min-width:160px;margin-bottom:0">
        <label>Method</label>
        <input type="text" id="admin-result-method" class="admin-input" placeholder="e.g. KO/TKO, Submission, Decision (Unanimous)" value="${escHtml(f.method||'')}">
      </div>
      <div class="form-group" style="min-width:120px;margin-bottom:0">
        <label>Method (broad)</label>
        <select id="admin-result-mbroad" class="admin-input">
          <option value="">—</option>
          <option ${f.method_broad==='KO/TKO'?'selected':''}>KO/TKO</option>
          <option ${f.method_broad==='Submission'?'selected':''}>Submission</option>
          <option ${f.method_broad==='Decision'?'selected':''}>Decision</option>
          <option ${f.method_broad==='No Contest'?'selected':''}>No Contest</option>
          <option ${f.method_broad==='Draw'?'selected':''}>Draw</option>
        </select>
      </div>
      <div class="form-group" style="width:60px;margin-bottom:0">
        <label>Round</label>
        <input type="number" id="admin-result-round" class="admin-input" min="1" max="5" value="${f.round||''}">
      </div>
      <div class="form-group" style="width:80px;margin-bottom:0">
        <label>Time</label>
        <input type="text" id="admin-result-time" class="admin-input" placeholder="4:35" value="${escHtml(f.time||'')}">
      </div>
      <button class="btn btn-red btn-sm" onclick="adminSaveResult()">Save result</button>
    </div>`;
}

async function adminSaveResult() {
  if (!adminResultFight) return;
  const f = adminResultFight;

  const entry = {
    fight_id:    f.id,
    winner_id:   document.getElementById('admin-result-winner').value || null,
    method:      document.getElementById('admin-result-method').value.trim() || null,
    method_broad: document.getElementById('admin-result-mbroad').value || null,
    round:       parseInt(document.getElementById('admin-result-round').value) || null,
    time:        document.getElementById('admin-result-time').value.trim() || null
  };

  const { error } = await sb.from('fight_results')
    .upsert(entry, { onConflict: 'fight_id' });
  if (error) { showToast('Error: ' + error.message); return; }

  showToast('Result saved');
  document.getElementById('admin-result-form').style.display = 'none';
  document.getElementById('admin-result-search').value = '';
  adminResultFight = null;
}
