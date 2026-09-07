# Rewatch

Static MMA rewatch tracker connected to Supabase. Serve this directory with a local HTTP server to preview it.

## Ratings

Ratings are unique per `(user_id, fight_id)`; ownership is required. Existing ownership RLS policies protect reads and writes. The Supabase migration `ratings_unique_per_user_and_fight` was applied on September 7, 2026, preserving all 1,235 existing ratings.

Rating and note edits share a serialized queue per user/fight. Edits during a request merge into the next write. Failed edits remain pending and the next rating/note edit retries them; an error toast explains this. Navigation or page closure is not an offline persistence mechanism. Writes use the composite conflict target and return the saved row. Note-only edits omit the rating so they preserve its stored value. Account changes prevent stale responses from updating another user's cache.

## Responsive layout

At widths up to 1,000px, navigation wraps below the header and matchups occupy their own row. Narrow cards wrap names and results. Header margins stay inside the document width.

## Checks

Run `node tests/rating-saves.cjs` for delayed-save, overlapping-note, retry, and account-switch regression checks. Preview event/fighter pages at phone and desktop widths when changing layouts.

## Database deployment order

Apply the unique-per-user migration before deploying this frontend. The old single-fight constraint must be removed, and `(user_id, fight_id)` must be unique for the upsert conflict target. The live migration added `ratings_user_id_fight_id_key`, set `user_id NOT NULL`, and dropped `ratings_fight_id_key`. Database verification used temporary ratings in a rolled-back transaction to verify two users rating one fight and RLS read/update isolation.

Header padding is container-relative (24px on desktop), so ultrawide viewports do not squeeze the logo, navigation, or account controls.
