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

function showDbReady(count) {
  setStatus('✓ Database ready — ' + Number(count).toLocaleString() + ' fights (1993–2025)');
  document.getElementById('db-status-text').className = 'db-banner-text ready';
  document.getElementById('no-db-msg').style.display = 'none';
  document.getElementById('event-search').disabled = false;
  loadRecentEvents();
}
