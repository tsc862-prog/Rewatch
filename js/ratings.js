// ── Ratings (load / delete) ───────────────────────────────────────────────────

async function loadRatings() {
  const { data: ratingsData, error } = await sb
    .from('ratings')
    .select('*')
    .order('logged_at', { ascending: false });

  if (error || !ratingsData?.length) { myRatings = []; return; }

  const fightIds = ratingsData.map(r => r.fight_id);
  const { data: fightData } = await sb
    .from('fight_search')
    .select('*')
    .in('id', fightIds);

  const fightMap = Object.fromEntries((fightData || []).map(f => [f.id, f]));
  myRatings = ratingsData.map(r => ({ ...fightMap[r.fight_id], ...r }));
}

async function deleteRating(fightId) {
  const { error } = await sb.from('ratings').delete().eq('fight_id', fightId);
  if (error) { showToast('Error: ' + error.message); return; }
  myRatings = myRatings.filter(r => r.fight_id !== fightId);
  renderTable();
}
