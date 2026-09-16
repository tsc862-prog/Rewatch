# MMA Rewatch

Static MMA rewatch tracker connected to Supabase. Serve this directory with a local HTTP server to preview it.

## Ratings

Ratings are unique per `(user_id, fight_id)`; ownership is required. Existing ownership RLS policies protect reads and writes. The Supabase migration `ratings_unique_per_user_and_fight` was applied on September 7, 2026, preserving all 1,235 existing ratings.

Rating and note edits share a serialized queue per user/fight. Edits during a request merge into the next write. Failed edits remain pending and the next rating/note edit retries them; an error toast explains this. Navigation or page closure is not an offline persistence mechanism. Writes use the composite conflict target and return the saved row. Note-only edits omit the rating so they preserve its stored value. Account changes prevent stale responses from updating another user's cache.

## Responsive layout

At widths up to 1,000px, navigation wraps below the header and matchups occupy their own row. Narrow cards wrap names and results. Header margins stay inside the document width.

## Checks

Run `node tests/rating-saves.cjs` for delayed-save, overlapping-note, retry, and account-switch regression checks, and `node tests/crowd-blend.cjs` for the crowd blend rule.

## Crowd score

Every past fight row can carry a quiet grey number after the stars: the user's rating blended with "other users". The crowd side is Verdict MMA's fan score (`crowd_rating` 0–10 and `crowd_rating_count` on `fight_search`, scraped nightly by the scraper repo's `verdict_scraper.py`), halved to the 0–5 star scale and weighted `min(1, count / 50)` against the user's own rating (weight 1). UFC bonus awards (`bonus_awards`: `FOTN`, `POTN`, `KOTN`, `SOTN`) add a fixed bump of 0.25 star for Fight of the Night and 0.1 for the per-fighter awards, capped at 5; each award is a small `FOTN` / `POTN` / `KOTN` / `SOTN` tag (same family as TITLE BOUT) on its own right-aligned line directly under the result and watch links, with the full name in its tooltip. The number is omitted when there is nothing beyond the user's own stars to blend (no crowd data and no bonus); a bonus alone never produces a score. Both the number and the bonus label sit behind the row's spoiler gate: while the result is hidden ("Rate to reveal result") nothing is shown at all, since a crowd score reveals whether the fight was any good and a bonus name reveals a finish; they appear with the result once the fight is rated. The tooltip spells out the inputs. `blendRating()` and `crowdScoreHtml()` in `js/events.js` hold the rule. Tables and view columns were added on September 16, 2026 (scraper repo `migrate/add_crowd_ratings.sql`). Preview event/fighter pages at phone and desktop widths when changing layouts.

## Database deployment order

Apply the unique-per-user migration before deploying this frontend. The old single-fight constraint must be removed, and `(user_id, fight_id)` must be unique for the upsert conflict target. The live migration added `ratings_user_id_fight_id_key`, set `user_id NOT NULL`, and dropped `ratings_fight_id_key`. Database verification used temporary ratings in a rolled-back transaction to verify two users rating one fight and RLS read/update isolation.

Header padding is container-relative (24px on desktop), so ultrawide viewports do not squeeze the logo, navigation, or account controls.

The MMA Rewatch identity uses `img/brand-mark.svg`: a closed coral octagon with twin rewind chevrons. The header, login screen, page title, and favicon share this identity.

## Watch links and spoilers

Every fight row shows compact per-platform watch icons. A fight's own video (`paramount_url`, `fightpass_url`, `youtube_url`, `pluto_url` on `fight_search`) is used when present. When a fight has no dedicated video on any platform but its event has a replay (`event_<platform>_url` on the same row), the event links take the icons' place, outlined in the platform colour with a "Full event on …" tooltip. A fight with its own video shows only its own links; the event replay is a stand-in, never an extra. A full-card replay wins over a prelims replay; a prelims-only link is still shown, labelled "Prelims on …", because the database cannot tell which card segment a fight sat on. The main event row (`is_main`, `fight_position_type` "Main Event", or `fight_position` 1) is the exception: it never sat on the prelims, so it skips prelims links.

A row with any watch link, fight-level or event-level, hides its result behind "Rate to reveal result" until the fight is rated. A row whose event is dated today (local time) is hidden the same way whether or not it has any watch link yet, since the card is airing and the scraper may already have posted results; rating the fight still reveals it. This applies on the fighter card as well as the event card, since the row reads the event links from its own `fight_search` record rather than from the currently open event. `fightWatchLinks()` and `watchIconHtml()` in `js/app.js` hold this logic. The view columns `event_espn_url`, `event_espn_prelims_url`, and `event_netflix_url` were added on September 7, 2026 (scraper repo `migrate/add_event_vod_columns.sql`).

## Loading states

Every screen that waits on the database shows the shared spinner (`loadingHtml()` in `js/app.js`, the `.dash-loading` block) instead of sitting still or showing an empty state early: the events list on first load (one `events_index()` call), event search, the event card and fighter card (via `showCardLoading()`, which swaps the search card out the moment a row is clicked), the My Ratings table before ratings arrive, the rankings tab while its snapshot index loads, and the dashboard activity feed. The dashboard and community tabs already had inline spinners. Card loads check that the user has not opened something else before painting, and restore the search card on error.

## Load performance

Each screen makes one request against precomputed data instead of assembling it client-side. `events_index()` returns every event with `has_results` / `has_fight_video` flags as a single JSON array (it replaced a fights count, an `event_result_flags` aggregate, and paging the events table down 1000 rows at a time, which together took 3 to 4 seconds). `my_ratings()` returns the signed-in user's ratings already joined to `fight_search`, newest first, in the same `{ ...fight, ...rating }` shape the app caches (it replaced a ratings query followed by chunked `fight_search` lookups). `community_dashboard()` keeps its signature but reads the `community_fight_base` materialized view.

The flags and the community base are materialized views in Supabase, refreshed by `refresh_app_caches.py` in the scraper repo at the end of every scraper pass (nightly workflow and the live-event loop). Between passes the Past list and Community stats reflect the last refresh; an open event card always reads live rows. The migration is `migrate/app_perf_precompute.sql` in the scraper repo and must be applied before deploying this frontend (added September 16, 2026).

`init()` in `js/app.js` fires every initial request at once and does not wait for the events list before marking ratings-dependent screens ready. supabase-js is pinned to an exact version, all scripts are `defer`red, and Chart.js is loaded on first use by `ensureChartJs()` rather than on every page view.
