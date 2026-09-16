// ── DB Status ─────────────────────────────────────────────────────────────────


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

// Called by loadRecentEvents once the events index has arrived — the index
// doubles as the "is there a database" check, so there's no separate count query.
function showDbReady(count) {
  setStatus('✓ Database ready — ' + Number(count).toLocaleString() + ' events');
  document.getElementById('db-status-text').className = 'db-banner-text ready';
  document.getElementById('no-db-msg').style.display = 'none';
  document.getElementById('event-search').disabled = false;
}
