// Weight classes across eras: the billed name is shown with its limit where
// that differs from today's, and grouping goes by the nearest modern class.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const start = source.indexOf('const STANDARD_WEIGHT_LIMITS');
const end = source.indexOf('function escHtml');
const c = {};
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.weightLabel = weightLabel; this.weightGroup = weightGroup;', c);
const row = (weight_class, weight_limit_lb) => ({ weight_class, weight_limit_lb });

// a modern row, or one whose limit is today's, reads and groups as itself
assert.equal(c.weightLabel(row('Middleweight')), 'Middleweight');
assert.equal(c.weightLabel(row('Middleweight', 185)), 'Middleweight');
assert.equal(c.weightGroup(row('Middleweight', '185')), 'Middleweight');

// early UFC: Middleweight was under 200, Lightweight under 170, Bantamweight under 155
assert.equal(c.weightLabel(row('Middleweight', 200)), 'Middleweight · 200 lb');
assert.equal(c.weightGroup(row('Middleweight', 200)), 'Light Heavyweight');
assert.equal(c.weightGroup(row('Lightweight', 170)), 'Welterweight');
assert.equal(c.weightLabel(row('Bantamweight', 155)), 'Bantamweight · 155 lb');
assert.equal(c.weightGroup(row('Bantamweight', 155)), 'Lightweight');

// PRIDE: Middleweight 205, Welterweight 183, Lightweight 161
assert.equal(c.weightGroup(row('Middleweight', 205)), 'Light Heavyweight');
assert.equal(c.weightGroup(row('Welterweight', 183)), 'Middleweight');
assert.equal(c.weightGroup(row('Lightweight', 161)), 'Lightweight');
assert.equal(c.weightLabel(row('Lightweight', 161)), 'Lightweight · 161 lb');

// no limit (Openweight, the early 200-and-over Heavyweight): name only
assert.equal(c.weightLabel(row('Openweight', null)), 'Openweight');
assert.equal(c.weightGroup(row('Heavyweight', null)), 'Heavyweight');

// catchweights carry their number in the name; women's classes keep the prefix
assert.equal(c.weightLabel(row('175lb Catchweight', 175)), '175lb Catchweight');
assert.equal(c.weightGroup(row("Women's Bantamweight", 125)), "Women's Flyweight");
assert.equal(c.weightLabel({}), '');

console.log('weight: ok');
