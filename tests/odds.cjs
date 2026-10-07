// Betting lines on the fight row — each fighter's closing American odds from
// BestFightOdds as a quiet number after the name (shown whether or not the
// result is revealed) — and the UPSET tag for a winner who closed as the
// underdog (behind the spoiler gate, like the bonus tags).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
const start = source.indexOf('const BONUS_LABEL');
const end = source.indexOf('function renderFightRow');
const c = { escHtml: s => s };
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.fmtOdds = fmtOdds; this.oddsHtml = oddsHtml; this.upsetPrice = upsetPrice; this.upsetTagHtml = upsetTagHtml;', c);

// formatting: + for the dog, a real minus sign for the favourite, nothing for no line
assert.equal(c.fmtOdds(169), '+169');
assert.equal(c.fmtOdds(-209), '−209');
assert.equal(c.fmtOdds('100'), '+100');
assert.equal(c.fmtOdds(null), '');
assert.equal(c.fmtOdds(undefined), '');
assert.equal(c.fmtOdds('abc'), '');

// markup: closing line, opener in the tooltip only when it differs; current line for an upcoming bout
assert.equal(c.oddsHtml(-209, -250, false),
  '<span class="odds-tag" title="Closing line −209 (opened −250) — BestFightOdds">−209</span>');
assert.equal(c.oddsHtml(140, 140, false),
  '<span class="odds-tag" title="Closing line +140 — BestFightOdds">+140</span>');
assert.equal(c.oddsHtml(-150, null, true),
  '<span class="odds-tag" title="Current line −150 — BestFightOdds">−150</span>');
assert.equal(c.oddsHtml(null, -250, false), '');

// upset: the winner closed positive AND the loser closed negative; ids compared as strings
const base = { fighter1_id: 10, fighter2_id: 20, fighter1_odds_close: -209, fighter2_odds_close: 169, winner_name: 'Dog' };
assert.equal(c.upsetPrice({ ...base, winner_id: 20 }), 169);          // underdog won
assert.equal(c.upsetPrice({ ...base, winner_id: '20' }), 169);        // bigint ids may arrive as strings
assert.equal(c.upsetPrice({ ...base, winner_id: 10 }), null);         // favourite won
assert.equal(c.upsetPrice({ ...base, winner_id: null }), null);       // draw / no contest
assert.equal(c.upsetPrice({ ...base, winner_id: 99 }), null);         // winner not in the bout (data quirk)
assert.equal(c.upsetPrice({ ...base, winner_id: 20, fighter1_odds_close: null }), null);  // one side missing
assert.equal(c.upsetPrice({ ...base, winner_id: 20, fighter1_odds_close: 105, fighter2_odds_close: 105 }), null);  // pick'em: both positive
assert.equal(c.upsetPrice({ ...base, winner_id: 20, fighter1_odds_close: -110, fighter2_odds_close: -110 }), null); // both negative
assert.equal(c.upsetTagHtml({ ...base, winner_id: 20 }),
  '<span class="bonus-tag upset-tag" title="Upset — Dog closed as a +169 underdog">UPSET</span>');
assert.equal(c.upsetTagHtml({ ...base, winner_id: 20, winner_name: null }),
  '<span class="bonus-tag upset-tag" title="Upset — the winner closed as a +169 underdog">UPSET</span>');
assert.equal(c.upsetTagHtml({ ...base, winner_id: 10 }), '');
console.log('PASS: odds formatting, line markup, upset detection and tag');
