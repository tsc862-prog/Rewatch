// ── Ratings (load / delete) ───────────────────────────────────────────────────

async function loadRatings() {
  const { data: ratingsData, error } = await sb
    .from('ratings')
    .select('*')
    .order('logged_at', { ascending: false });

  if (error || !ratingsData?.length) { myRatings = []; return; }

  const fightIds = ratingsData.map(r => r.fight_id);
  // Fetch fight metadata in batches: a single .in() with hundreds of 36-char UUIDs
  // overflows the request URL length limit and returns 400 (silently dropping all
  // fighter/event/method metadata from the dashboard).
  const CHUNK = 100;
  const chunks = [];
  for (let i = 0; i < fightIds.length; i += CHUNK) chunks.push(fightIds.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map(c => sb.from('fight_search').select('*').in('id', c))
  );
  const fightMap = {};
  results.forEach(({ data }) => (data || []).forEach(f => { fightMap[f.id] = f; }));
  myRatings = ratingsData.map(r => ({ ...fightMap[r.fight_id], ...r }));
}

async function deleteRating(fightId) {
  if (!requireAuth('manage ratings')) return;
  const { error } = await sb.from('ratings').delete().eq('fight_id', fightId);
  if (error) { showToast('Error: ' + error.message); return; }
  myRatings = myRatings.filter(r => r.fight_id !== fightId);
  renderTable();
}
