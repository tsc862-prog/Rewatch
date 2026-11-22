// Fight summaries on the fight row — a collapsed "Summary" toggle on the
// sub-meta line, shown only once the viewer has rated the fight. Unrated rows
// get a locked label and must not carry the summary text at all.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
const start = source.indexOf('const expandedSummaries');
const end = source.indexOf('function renderFightRow');
const els = {};
const el = () => ({ hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
const c = {
  escHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  document: { getElementById: id => els[id] || null },
};
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.expandedSummaries = expandedSummaries; this.summaryToggleHtml = summaryToggleHtml; this.summaryBodyHtml = summaryBodyHtml; this.toggleFightSummary = toggleFightSummary;', c);

const fight = { id: 'f1', summary: 'Harrison took <her> down & finished.' };

// no summary, or an upcoming bout: nothing at all, rated or not
assert.equal(c.summaryToggleHtml({ id: 'f1' }, true, false), '');
assert.equal(c.summaryBodyHtml({ id: 'f1' }, true, false), '');
assert.equal(c.summaryToggleHtml({ id: 'f1', summary: '' }, true, false), '');
assert.equal(c.summaryToggleHtml(fight, true, true), '');
assert.equal(c.summaryBodyHtml(fight, true, true), '');

// unrated: a locked label, and the text is nowhere in the markup
const locked = c.summaryToggleHtml(fight, false, false);
assert.match(locked, /class="summary-locked"/);
assert.match(locked, /Summary after rating/);
assert.doesNotMatch(locked, /<button/);
assert.doesNotMatch(locked, /Harrison/);
assert.equal(c.summaryBodyHtml(fight, false, false), '');

// rated: a collapsed toggle plus the escaped text, hidden until opened
const toggle = c.summaryToggleHtml(fight, true, false);
assert.match(toggle, /<button type="button" class="summary-toggle" id="summary-toggle-f1" aria-expanded="false" aria-controls="summary-f1" onclick="toggleFightSummary\('f1'\)">Summary</);
assert.equal(c.summaryBodyHtml(fight, true, false),
  '<div class="fight-row-summary" id="summary-f1" hidden>Harrison took &lt;her&gt; down &amp; finished.</div>');

// toggling opens it in place and is remembered, so a re-rendered row stays open
els['summary-f1'] = el();
els['summary-toggle-f1'] = el();
c.toggleFightSummary('f1');
assert.equal(els['summary-f1'].hidden, false);
assert.equal(els['summary-toggle-f1'].attrs['aria-expanded'], 'true');
assert.match(c.summaryToggleHtml(fight, true, false), /aria-expanded="true"/);
assert.doesNotMatch(c.summaryBodyHtml(fight, true, false), / hidden>/);
// numeric ids share the same remembered state as their string form
assert.match(c.summaryToggleHtml({ ...fight, id: 'f1' }, true, false), /aria-expanded="true"/);

// toggling again closes it; a missing row (navigated away) must not throw
c.toggleFightSummary('f1');
assert.equal(els['summary-f1'].hidden, true);
assert.equal(els['summary-toggle-f1'].attrs['aria-expanded'], 'false');
assert.match(c.summaryBodyHtml(fight, true, false), / hidden>/);
c.toggleFightSummary('gone');
assert.equal(c.expandedSummaries.has('gone'), true);

// an open summary never leaks into an unrated render of the same fight
c.toggleFightSummary('f1');
assert.equal(c.summaryBodyHtml(fight, false, false), '');
assert.doesNotMatch(c.summaryToggleHtml(fight, false, false), /Harrison/);

console.log('summary: ok');
