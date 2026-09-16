// Blend rule for the crowd score shown next to the stars: Verdict MMA's 0–10
// fan score (halved to stars) weighted by min(1, count/50) against the user's
// own rating, plus a small fixed bump for UFC bonus awards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
const start = source.indexOf('const CROWD_FULL_COUNT');
const end = source.indexOf('function renderFightRow');
const c = { escHtml: s => s };
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.blendRating = blendRating; this.crowdScoreHtml = crowdScoreHtml; this.bonusLabel = bonusLabel;', c);

// nothing to blend: no crowd, no bonus
assert.equal(c.blendRating(4, null, 0, null), null);
assert.equal(c.blendRating(0, null, 0, null), null);
assert.equal(c.blendRating(0, null, 0, 'FOTN'), null);          // a bonus alone isn't a score
// crowd only, full weight (>= 50 ratings): 8.4/10 → 4.2 stars
assert.equal(c.blendRating(0, 8.4, 455, null), 4.2);
// crowd only, partial weight still shows the crowd's own value
assert.equal(c.blendRating(0, 8.0, 5, null), 4.0);
// mine + full-weight crowd: plain mean of 3.0 and 4.0
assert.equal(c.blendRating(3, 8.0, 50, null), 3.5);
// mine + light crowd (10 ratings → weight 0.2): (3*1 + 4*0.2)/1.2 = 3.17
assert.equal(c.blendRating(3, 8.0, 10, null), 3.2);
// bonus bump: FOTN +0.25, capped at 5
assert.equal(c.blendRating(4, null, 0, 'FOTN'), 4.3);            // 4.25 → 4.3
assert.equal(c.blendRating(5, 10, 100, 'FOTN,POTN'), 5);
assert.equal(c.blendRating(0, 9.0, 100, 'POTN'), 4.6);
// labels
assert.equal(c.bonusLabel('FOTN,POTN'), 'Fight of the Night · Performance of the Night');
assert.equal(c.bonusLabel(null), '');
// markup: quiet span with a tooltip, nothing when there's nothing to show
assert.equal(c.crowdScoreHtml({ crowd_rating: null, crowd_rating_count: 0, bonus_awards: null }, 3), '');
const html = c.crowdScoreHtml({ crowd_rating: 8.36, crowd_rating_count: 444, bonus_awards: 'FOTN' }, 0);
assert.match(html, /^<span class="crowd-score" title="Fans on Verdict MMA: 8\.4\/10 from 444 ratings · Fight of the Night · crowd only — rate to blend">4\.4<\/span>$/);
console.log('PASS: crowd blend weights, bonus bump, labels, markup');
