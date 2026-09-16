// ── Ratings (load / delete) ───────────────────────────────────────────────────

async function loadRatings() {
  // One round trip: my_ratings() joins the caller's ratings to fight_search
  // server-side (under the ratings RLS) and returns each fight row overlaid
  // with its rating row, newest first — the same { ...fight, ...rating } shape
  // the app has always cached. Replaces a ratings query followed by a dozen
  // chunked fight_search lookups.
  const { data, error } = await sb.rpc('my_ratings');
  myRatings = (error || !Array.isArray(data)) ? [] : data;
}

async function deleteRating(fightId) {
  if (!requireAuth('manage ratings')) return;
  const { error } = await sb.from('ratings').delete().eq('fight_id', fightId).eq('user_id', currentUser.id);
  if (error) { showToast('Error: ' + error.message); return; }
  myRatings = myRatings.filter(r => r.fight_id !== fightId);
  renderTable();
}
