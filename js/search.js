// ── Fight Search + Autocomplete ───────────────────────────────────────────────

let acIdx = -1, acResults = [];
let searchTimer = null;

function fightSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doFightSearch, 300);
}

async function doFightSearch() {
  const q  = document.getElementById('fight-search').value.trim();
  const ac = document.getElementById('fight-ac');
  acIdx = -1;
  if (q.length < 2) { ac.style.display = 'none'; return; }

  const { data, error } = await sb
    .from('fight_search')
    .select('*')
    .or(`fighter1_name.ilike.%${q}%,fighter2_name.ilike.%${q}%,event_name.ilike.%${q}%`)
    .limit(12);

  if (error || !data?.length) { ac.style.display = 'none'; acResults = []; return; }

  acResults = data;
  const ql = q.toLowerCase();
  ac.innerHTML = data.map((r, i) => {
    const rated = myRatings.find(x => x.fight_id === r.id);
    const wt = r.winner_name ? ` <span style="color:#E24B4A;font-size:11px">W: ${r.winner_name}</span>` : '';
    const rt = rated ? ` <span style="color:#3B6D11;font-size:10px">★ rated</span>` : '';
    return `<div class="ac-item" onmousedown="acPick(event,${i})">
      <div>${hl(r.fighter1_name, ql)} vs ${hl(r.fighter2_name, ql)}${wt}${rt}</div>
      <div class="ac-meta">${r.event_name||''} · ${r.event_date||''} · ${r.weight_class||''} · ${shortM(r.method)}</div>
    </div>`;
  }).join('');
  ac.style.display = 'block';
}

function fightSearchKey(e) {
  const ac = document.getElementById('fight-ac');
  const items = ac.querySelectorAll('.ac-item');
  if (!items.length || ac.style.display === 'none') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); acIdx = Math.min(acIdx+1, items.length-1); items.forEach((el,i) => el.classList.toggle('focused', i===acIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acIdx = Math.max(0, acIdx-1); items.forEach((el,i) => el.classList.toggle('focused', i===acIdx)); }
  else if (e.key === 'Enter') { if (acIdx >= 0) { e.preventDefault(); selectFight(acResults[acIdx]); } ac.style.display='none'; }
  else if (e.key === 'Escape') { ac.style.display = 'none'; }
}

function fightBlur() { setTimeout(() => { document.getElementById('fight-ac').style.display = 'none'; }, 150); }
function acPick(e, i) { e.preventDefault(); selectFight(acResults[i]); }

function selectFight(r) {
  selectedFight = r;
  document.getElementById('fight-search').value = r.fighter1_name + ' vs ' + r.fighter2_name;
  document.getElementById('fight-ac').style.display = 'none';
  const existing = myRatings.find(x => x.fight_id === r.id);
  setRating(existing ? existing.rating : 0);
  document.getElementById('notes').value = existing ? (existing.notes || '') : '';
  const wTag = r.winner_name ? `<span class="winner-tag">W: ${r.winner_name}</span>` : '';
  document.getElementById('fight-preview').innerHTML = `
    <div class="fight-preview">
      <div class="fight-preview-title">${r.fighter1_name} vs ${r.fighter2_name} ${wTag}</div>
      <div class="fight-preview-meta">
        <span>${r.event_name||'—'}</span>
        <span>${r.event_date||'—'}</span>
        ${r.event_location ? `<span>${r.event_location}</span>` : ''}
        <span>${r.weight_class||'—'}</span>
        <span>${r.method||'—'}</span>
        <span>${r.round ? 'R'+r.round+(r.time?' · '+r.time:'') : r.time||''}</span>
        ${r.is_main ? '<span class="main-tag">Main event</span>' : ''}
      </div>
    </div>`;
  document.getElementById('fight-preview').style.display = 'block';
  document.getElementById('rate-form').style.display = 'block';
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
