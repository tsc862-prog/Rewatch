// Crowd score shown next to the stars: Verdict MMA's 0–10 fan score halved to
// the app's 0–5 scale, shown as-is (not blended with the user's rating), plus
// the bonus-award tags.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
const start = source.indexOf('const BONUS_LABEL');
const end = source.indexOf('function renderFightRow');
const c = { escHtml: s => s };
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.crowdScore = crowdScore; this.crowdScoreHtml = crowdScoreHtml; this.bonusLabel = bonusLabel; this.bonusTagsHtml = bonusTagsHtml;', c);

// no crowd data → nothing, whatever the user rated
assert.equal(c.crowdScore(null, 0), null);
assert.equal(c.crowdScore(8.4, 0), null);
// the crowd score halved to stars, one decimal, regardless of count
assert.equal(c.crowdScore(8.4, 455), 4.2);
assert.equal(c.crowdScore(8.36, 1), 4.2);
assert.equal(c.crowdScore(2.4, 495), 1.2);
assert.equal(c.crowdScore(10, 3), 5);
// labels + tags
assert.equal(c.bonusLabel('FOTN,POTN'), 'Fight of the Night · Performance of the Night');
assert.equal(c.bonusLabel(null), '');
assert.equal(c.bonusTagsHtml('FOTN,POTN,XYZ'),
  '<span class="bonus-tag" title="Fight of the Night">FOTN</span><span class="bonus-tag" title="Performance of the Night">POTN</span>');
assert.equal(c.bonusTagsHtml(null), '');
// markup: quiet span with the source in the tooltip; nothing without crowd data
assert.equal(c.crowdScoreHtml({ crowd_rating: null, crowd_rating_count: 0, bonus_awards: 'FOTN' }), '');
assert.equal(c.crowdScoreHtml({ crowd_rating: 8.36, crowd_rating_count: 444 }),
  '<span class="crowd-score" title="Fans on Verdict MMA: 8.4/10 from 444 ratings">4.2</span>');
assert.equal(c.crowdScoreHtml({ crowd_rating: 7, crowd_rating_count: 1 }),
  '<span class="crowd-score" title="Fans on Verdict MMA: 7.0/10 from 1 rating">3.5</span>');
console.log('PASS: crowd score (unblended), bonus labels and tags, markup');
