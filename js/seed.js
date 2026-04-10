// ── DB Seed ───────────────────────────────────────────────────────────────────

async function importDB(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const errEl = document.getElementById('db-err');
  const prog  = document.getElementById('progress');
  const fill  = document.getElementById('progress-fill');
  errEl.style.display = 'none';
  prog.style.display = 'block';
  fill.style.width = '5%';
  setStatus('Reading file…');

  let text;
  try { text = await file.text(); }
  catch(err) { return showImportErr('Could not read file: ' + err.message); }

  let data;
  try { data = JSON.parse(text); }
  catch(err) { return showImportErr('JSON parse error: ' + err.message); }

  if (!Array.isArray(data) || !data.length)
    return showImportErr('No fight records found in file.');

  const BATCH = 500;

  // ── Pass 1: fighters ───────────────────────────────────────────────────────
  fill.style.width = '10%';
  setStatus('Seeding fighters…');

  const fighterSet = new Set();
  data.forEach(r => { if (r[1]) fighterSet.add(r[1]); if (r[2]) fighterSet.add(r[2]); });
  const fighterRows = [...fighterSet].map(name => ({ name }));

  for (let i = 0; i < fighterRows.length; i += BATCH) {
    const { error } = await sb
      .from('fighters')
      .upsert(fighterRows.slice(i, i + BATCH), { onConflict: 'name', ignoreDuplicates: true });
    if (error) return showImportErr('Fighters: ' + error.message);
  }

  const { data: allFighters, error: fe } = await sb
    .from('fighters').select('id, name').limit(10000);
  if (fe) return showImportErr('Could not load fighters: ' + fe.message);
  const fighterIdMap = Object.fromEntries(allFighters.map(f => [f.name, f.id]));

  // ── Pass 2: events ─────────────────────────────────────────────────────────
  fill.style.width = '25%';
  setStatus('Seeding events…');

  const eventMap = new Map();
  data.forEach(r => { if (r[4]) eventMap.set(r[4], r[5] || null); });
  const eventRows = [...eventMap.entries()].map(([name, date]) => ({ name, date }));

  for (let i = 0; i < eventRows.length; i += BATCH) {
    const { error } = await sb
      .from('events')
      .upsert(eventRows.slice(i, i + BATCH), { onConflict: 'name', ignoreDuplicates: true });
    if (error) return showImportErr('Events: ' + error.message);
  }

  const { data: allEvents, error: ee } = await sb
    .from('events').select('id, name').limit(5000);
  if (ee) return showImportErr('Could not load events: ' + ee.message);
  const eventIdMap = Object.fromEntries(allEvents.map(e => [e.name, e.id]));

  // ── Pass 3: fights ─────────────────────────────────────────────────────────
  fill.style.width = '40%';
  setStatus('Seeding fights…');

  // Track per-event position counter based on file order
  const eventPosCounter = {};
  const fightRows = data
    .filter(r => r[1] && r[2] && r[4])
    .map(r => {
      const eid = eventIdMap[r[4]];
      if (eid) eventPosCounter[eid] = (eventPosCounter[eid] || 0) + 1;
      return {
        id:            String(r[0]),
        event_id:      eid,
        fighter1_id:   fighterIdMap[r[1]],
        fighter2_id:   fighterIdMap[r[2]],
        weight_class:  r[6] || null,
        is_main:       !!r[11],
        fight_position: eid ? eventPosCounter[eid] : null
      };
    })
    .filter(r => r.event_id && r.fighter1_id && r.fighter2_id);

  const fightBatches = Math.ceil(fightRows.length / BATCH);
  let fightDone = 0;
  for (let i = 0; i < fightRows.length; i += BATCH) {
    const { error } = await sb
      .from('fights')
      .upsert(fightRows.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) return showImportErr('Fights: ' + error.message);
    fightDone++;
    fill.style.width = (40 + Math.round(fightDone / fightBatches * 25)) + '%';
  }

  // ── Pass 4: fight_results ──────────────────────────────────────────────────
  fill.style.width = '65%';
  setStatus('Seeding fight results…');

  const insertedFightIds = new Set(fightRows.map(r => r.id));
  const resultRows = data
    .filter(r => r[7] && insertedFightIds.has(String(r[0])))
    .map(r => ({
      fight_id:    String(r[0]),
      winner_id:   r[3] ? (fighterIdMap[r[3]] || null) : null,
      method:      r[7]  || null,
      method_broad: r[8] || null,
      round:       r[9]  || null,
      time:        r[10] || null
    }));

  const resultBatches = Math.ceil(resultRows.length / BATCH);
  let resultDone = 0;
  for (let i = 0; i < resultRows.length; i += BATCH) {
    const { error } = await sb
      .from('fight_results')
      .upsert(resultRows.slice(i, i + BATCH), { onConflict: 'fight_id', ignoreDuplicates: true });
    if (error) return showImportErr('Results: ' + error.message);
    resultDone++;
    fill.style.width = (65 + Math.round(resultDone / resultBatches * 30)) + '%';
  }

  fill.style.width = '100%';
  showDbReady(fightRows.length);
  showToast('Seeded ' + fightRows.length.toLocaleString() + ' fights');
  setTimeout(() => { prog.style.display = 'none'; fill.style.width = '0%'; }, 800);
}

// ── Title fights CSV import ──────────────────────────────────────────────────

async function importTitleFights(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let text;
  try { text = await file.text(); } catch (err) { showToast('Could not read file: ' + err.message); return; }

  const lines = text.trim().split('\n').slice(1); // skip header
  if (!lines.length) { showToast('No title fight records found.'); return; }

  // Parse CSV rows (event_name, r_fighter, b_fighter, weight_class, is_title_bout)
  const records = lines.map(line => {
    const cols = line.split(',');
    return { event: cols[0]?.trim(), f1: cols[1]?.trim(), f2: cols[2]?.trim() };
  }).filter(r => r.event && r.f1 && r.f2);

  // Load events and fighters for lookup
  const { data: allEvents } = await sb.from('events').select('id, name').limit(5000);
  const { data: allFighters } = await sb.from('fighters').select('id, name').limit(10000);
  if (!allEvents || !allFighters) { showToast('Could not load events/fighters.'); return; }

  // Extract prefix like "UFC 299" or "UFC Fight Night" from event names
  function eventPrefix(name) {
    const m = name.match(/^(UFC\s+\d+|UFC Fight Night|UFC on \w+\s*\d*)/i);
    return m ? m[1].toLowerCase().replace(/\s+/g, ' ').trim() : name.toLowerCase().trim();
  }

  // Build map: prefix -> [event ids]
  const prefixToEventIds = {};
  for (const e of allEvents) {
    const p = eventPrefix(e.name);
    if (!prefixToEventIds[p]) prefixToEventIds[p] = [];
    prefixToEventIds[p].push(e.id);
  }

  const fighterIdMap = Object.fromEntries(allFighters.map(f => [f.name, f.id]));
  const fighterIdMapLower = Object.fromEntries(allFighters.map(f => [f.name.toLowerCase(), f.id]));

  let updated = 0;
  let skipped = 0;
  const skipReasons = [];

  for (const r of records) {
    const f1id = fighterIdMap[r.f1] || fighterIdMapLower[r.f1.toLowerCase()];
    const f2id = fighterIdMap[r.f2] || fighterIdMapLower[r.f2.toLowerCase()];
    const eids = prefixToEventIds[eventPrefix(r.event)];
    if (!f1id || !f2id || !eids) {
      skipped++;
      if (skipReasons.length < 10) {
        const why = [];
        if (!eids) why.push('event: ' + r.event + ' (prefix: ' + eventPrefix(r.event) + ')');
        if (!f1id) why.push('f1: ' + r.f1);
        if (!f2id) why.push('f2: ' + r.f2);
        skipReasons.push(why.join(', '));
      }
      continue;
    }

    // Match fight by event + fighter pair (either order)
    const { data: fights } = await sb
      .from('fights')
      .select('id')
      .in('event_id', eids)
      .or(`and(fighter1_id.eq.${f1id},fighter2_id.eq.${f2id}),and(fighter1_id.eq.${f2id},fighter2_id.eq.${f1id})`);

    if (!fights?.length) { skipped++; continue; }

    for (const fight of fights) {
      const { error } = await sb.from('fights').update({ is_title: true }).eq('id', fight.id);
      if (!error) updated++;
    }
  }

  if (skipReasons.length) console.warn('Title fight skip reasons (first 10):', skipReasons);
  showToast(`Title fights updated: ${updated}, skipped: ${skipped}`);
}

// ── Ratings CSV import ────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = [];
  let inQuote = false, current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; } // escaped ""
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseRatingsFile(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    if (!line.trim()) return null;
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  }).filter(r => r && r.Event && r.Winner && r.Loser);
}

function csvMapWeightClass(w) {
  if (!w) return null;
  if (w.startsWith("Women's")) return w;
  return w.replace("Men's ", "");
}

function csvMapPosType(p) {
  const l = p.toLowerCase();
  if (l.includes('main event')) return 'Main Event';
  if (l.includes('main card')) return 'Main Card';
  return 'Prelim';
}

function csvMapMethod(finish) {
  if (!finish) return null;
  const f = finish.toLowerCase();
  if (f === 'unanimous decision') return 'Decision (Unanimous)';
  if (f === 'split decision')    return 'Decision (Split)';
  if (f === 'majority decision') return 'Decision (Majority)';
  if (f === 'majority draw')     return 'Majority Draw';
  if (f === 'no contest')        return 'No Contest';
  return finish;
}

function csvMapMethodBroad(finish) {
  if (!finish) return null;
  const f = finish.toLowerCase();
  if (f.includes('ko') || f.includes('tko')) return 'KO/TKO';
  if (f.includes('submission'))              return 'Submission';
  if (f.includes('draw'))                    return 'Draw';
  if (f.includes('decision'))                return 'Decision';
  if (f.includes('no contest') || f.includes('dq')) return 'No Contest';
  return null;
}

function csvExtractRanks(notes, f1Name, f2Name) {
  if (!notes) return { f1Rank: null, f2Rank: null };
  const found = {};
  const re = /(\w+)\s+#([A-Z0-9]+)/gi;
  let m;
  while ((m = re.exec(notes)) !== null) found[m[1].toLowerCase()] = m[2].toUpperCase();
  if (!Object.keys(found).length) return { f1Rank: null, f2Rank: null };

  const f1Last = f1Name.split(' ').pop().toLowerCase();
  const f2Last = f2Name.split(' ').pop().toLowerCase();
  let f1Rank = null, f2Rank = null;

  for (const [name, rank] of Object.entries(found)) {
    // Match on last name — tolerant of minor typos via 4-char prefix
    if (f1Last === name || f1Last.startsWith(name) || name.startsWith(f1Last.slice(0, 4))) {
      f1Rank = rank;
    } else if (f2Last === name || f2Last.startsWith(name) || name.startsWith(f2Last.slice(0, 4))) {
      f2Rank = rank;
    }
  }
  return { f1Rank, f2Rank };
}

async function csvFindFight(eventId, f1Id, f2Id) {
  let { data } = await sb.from('fights').select('id')
    .eq('event_id', eventId).eq('fighter1_id', f1Id).eq('fighter2_id', f2Id)
    .maybeSingle();
  if (data?.id) return data.id;
  ({ data } = await sb.from('fights').select('id')
    .eq('event_id', eventId).eq('fighter1_id', f2Id).eq('fighter2_id', f1Id)
    .maybeSingle());
  return data?.id || null;
}

async function importRatingsCSV(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let text;
  try { text = await file.text(); } catch (err) { showToast('Could not read file'); return; }

  const rows = parseRatingsFile(text);
  if (!rows.length) { showToast('No valid rows found'); return; }

  const prog = document.getElementById('progress');
  const fill = document.getElementById('progress-fill');
  prog.style.display = 'block';
  fill.style.width = '5%';
  setStatus('Syncing events…');

  // ── Pass 1: upsert events ─────────────────────────────────────────────────
  const uniqueEvents = [...new Set(rows.map(r => r.Event))];
  await sb.from('events').upsert(
    uniqueEvents.map(name => ({ name })),
    { onConflict: 'name', ignoreDuplicates: true }
  );
  const { data: allEvents } = await sb.from('events').select('id, name').limit(5000);
  const eventIdMap = Object.fromEntries((allEvents || []).map(ev => [ev.name.toLowerCase(), ev.id]));

  // ── Pass 2: upsert fighters ───────────────────────────────────────────────
  fill.style.width = '15%';
  setStatus('Syncing fighters…');
  const uniqueFighters = [...new Set(rows.flatMap(r => [r.Winner, r.Loser]))];
  await sb.from('fighters').upsert(
    uniqueFighters.map(name => ({ name })),
    { onConflict: 'name', ignoreDuplicates: true }
  );
  const { data: allFighters } = await sb.from('fighters').select('id, name').limit(10000);
  const fighterIdMap = Object.fromEntries((allFighters || []).map(f => [f.name.toLowerCase(), f.id]));

  // ── Pass 3: fights / results / ratings ────────────────────────────────────
  fill.style.width = '20%';
  setStatus('Importing fights…');

  let done = 0, skipped = 0;
  const total = rows.length;

  for (const row of rows) {
    const eventId    = eventIdMap[row.Event.toLowerCase()];
    const f1Id       = fighterIdMap[row.Winner.toLowerCase()];
    const f2Id       = fighterIdMap[row.Loser.toLowerCase()];
    if (!eventId || !f1Id || !f2Id) { skipped++; continue; }

    // Find or create fight
    let fightId = await csvFindFight(eventId, f1Id, f2Id);
    const posType    = csvMapPosType(row.Placement);
    const { f1Rank, f2Rank } = csvExtractRanks(row.Notes || '', row.Winner, row.Loser);

    if (!fightId) {
      const { data: maxPos } = await sb.from('fights')
        .select('fight_position').eq('event_id', eventId)
        .order('fight_position', { ascending: false, nullsFirst: false }).limit(1);
      const nextPos = (maxPos?.length && maxPos[0].fight_position != null) ? maxPos[0].fight_position + 1 : 1;
      const newId = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const { error } = await sb.from('fights').insert({
        id: newId, event_id: eventId,
        fighter1_id: f1Id, fighter2_id: f2Id,
        weight_class: csvMapWeightClass(row.Weight),
        fight_position_type: posType,
        fight_position: nextPos,
        is_title: row['Title?'] === 'TRUE',
        is_main: posType === 'Main Event',
        fighter1_rank: f1Rank, fighter2_rank: f2Rank
      });
      if (error) { skipped++; continue; }
      fightId = newId;
    } else if (f1Rank || f2Rank) {
      // Update rankings on existing fight
      const upd = {};
      if (f1Rank) upd.fighter1_rank = f1Rank;
      if (f2Rank) upd.fighter2_rank = f2Rank;
      await sb.from('fights').update(upd).eq('id', fightId);
    }

    // Upsert fight result (winner = Winner column = f1)
    await sb.from('fight_results').upsert({
      fight_id: fightId, winner_id: f1Id,
      method: csvMapMethod(row.Finish),
      method_broad: csvMapMethodBroad(row.Finish),
      round: parseInt(row.Round) || null,
      time: row.Time || null
    }, { onConflict: 'fight_id' });

    // Upsert rating
    const ratingVal = parseFloat(row.Rating);
    if (!isNaN(ratingVal) && ratingVal > 0) {
      const { data: existing } = await sb.from('ratings').select('fight_id')
        .eq('fight_id', fightId).maybeSingle();
      if (existing?.fight_id) {
        await sb.from('ratings').update({
          rating: ratingVal, notes: row.Notes || null, logged_at: Date.now()
        }).eq('fight_id', fightId);
      } else {
        await sb.from('ratings').insert({
          fight_id: fightId, rating: ratingVal, notes: row.Notes || null, logged_at: Date.now()
        });
      }
    }

    done++;
    fill.style.width = (20 + Math.round(done / total * 78)) + '%';
    if (done % 25 === 0) setStatus(`Importing… ${done} / ${total}`);
  }

  fill.style.width = '100%';
  setStatus(`✓ Imported ${done} rows${skipped ? ' (' + skipped + ' skipped)' : ''}`);
  setTimeout(() => { prog.style.display = 'none'; fill.style.width = '0%'; }, 1000);
  showToast(`Imported ${done} fights${skipped ? ', ' + skipped + ' skipped' : ''}`);
  await loadRatings();
  renderTable();
}

function showImportErr(msg) {
  document.getElementById('db-err').textContent = msg;
  document.getElementById('db-err').style.display = 'block';
  document.getElementById('progress').style.display = 'none';
  setStatus('Import failed.', true);
}

function setStatus(msg, err) {
  const el = document.getElementById('db-status-text');
  el.textContent = msg;
  el.className = 'db-banner-text' + (err ? ' error' : '');
}

function showNoDb() {
  setStatus('No fights in database — import ufc_data.json to seed it.');
  document.getElementById('no-db-msg').style.display = 'block';
  document.getElementById('event-search').disabled = true;
}

function showDbReady(count) {
  setStatus('✓ Database ready — ' + Number(count).toLocaleString() + ' fights (1993–2025)');
  document.getElementById('db-status-text').className = 'db-banner-text ready';
  document.getElementById('no-db-msg').style.display = 'none';
  document.getElementById('event-search').disabled = false;
  document.getElementById('db-err').style.display = 'none';
}
