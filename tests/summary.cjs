// The row's detail panel — the arrow at the end of a fight row opens the
// fight's summary plus the viewer's notes. The summary shows only once the
// viewer has rated the fight; an unrated row must not carry the text at all.
// The notes box is always present, because saves read its value.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
const start = source.indexOf('const expandedSummaries');
const end = source.indexOf('// Column headings for the fight table');
const els = {};
const el = () => ({ hidden: true, attrs: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; } });
const c = {
  escHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  document: { getElementById: id => els[id] || null },
};
vm.createContext(c);
vm.runInContext(source.slice(start, end) + '\nthis.expandedSummaries = expandedSummaries; this.detailToggleHtml = detailToggleHtml; this.detailBodyHtml = detailBodyHtml; this.toggleFightDetail = toggleFightDetail;', c);

const fight = { id: 'f1', summary: 'Harrison took <her> down & finished.' };

// an upcoming bout has nothing to open: no arrow, no panel
assert.doesNotMatch(c.detailToggleHtml(fight, true, true, true), /<button/);
assert.equal(c.detailBodyHtml(fight, true, true, 'x'), '');

// no summary: the arrow opens notes only
const plain = c.detailToggleHtml({ id: 'f1' }, true, false, false);
assert.match(plain, /aria-label="Show notes"/);
assert.doesNotMatch(plain, /fr-note-dot/);
const plainBody = c.detailBodyHtml({ id: 'f1' }, true, false, '');
assert.match(plainBody, /class="fr-detail no-summary" id="detail-f1" hidden>/);
assert.doesNotMatch(plainBody, /fr-summary/);
assert.match(plainBody, /<textarea class="fight-row-notes" id="notes-f1"/);

// unrated: a locked line, and the text is nowhere in the markup; notes stay
const lockedToggle = c.detailToggleHtml(fight, false, false, false);
assert.match(lockedToggle, /aria-label="Show notes"/);
assert.doesNotMatch(lockedToggle, /Harrison/);
const lockedBody = c.detailBodyHtml(fight, false, false, 'Watch with <Dad>');
assert.match(lockedBody, /Summary appears here once you rate the fight\./);
assert.doesNotMatch(lockedBody, /Harrison/);
assert.match(lockedBody, />Watch with &lt;Dad&gt;<\/textarea>/);

// rated: a collapsed arrow plus the escaped text, hidden until opened
const toggle = c.detailToggleHtml(fight, true, false, true);
assert.match(toggle, /<button type="button" class="fr-expand" id="detail-toggle-f1" aria-expanded="false" aria-controls="detail-f1" aria-label="Show summary and notes\. You have a note on this fight\."/);
assert.match(toggle, /onclick="toggleFightDetail\('f1'\)"/);
assert.match(toggle, /fr-note-dot/); // the red dot marks an existing note
const body = c.detailBodyHtml(fight, true, false, 'mine');
assert.match(body, /^<div class="fr-detail" id="detail-f1" hidden><p class="fr-summary">Harrison took &lt;her&gt; down &amp; finished\.<\/p><textarea /);
assert.match(body, /onblur="saveNotes\('f1'\)">mine<\/textarea><\/div>$/);

// pre-fight context (weight miss, late replacement) is not a spoiler: it shows
// rated or not, above the summary, and on a fight with no summary too
const ctx = { ...fight, context: 'Potieria weighed 188 lb, over the <185.5> limit.' };
const ctxLocked = c.detailBodyHtml(ctx, false, false, '');
assert.match(ctxLocked, /<div class="fr-detail-text"><p class="fr-context">Potieria weighed 188 lb, over the &lt;185\.5&gt; limit\.<\/p><p class="fr-summary fr-summary-locked">/);
assert.doesNotMatch(ctxLocked, /Harrison/);
assert.match(c.detailBodyHtml(ctx, true, false, ''), /<\/p><p class="fr-summary">Harrison/);
const ctxOnly = c.detailBodyHtml({ id: 'f1', context: 'Late call.' }, false, false, '');
assert.match(ctxOnly, /class="fr-detail" id="detail-f1" hidden><div class="fr-detail-text"><p class="fr-context">Late call\.<\/p><\/div><textarea/);

// toggling opens it in place and is remembered, so a re-rendered row stays open
els['detail-f1'] = el();
els['detail-toggle-f1'] = Object.assign(el(), { dataset: { summary: 'true', note: 'false' } });
c.toggleFightDetail('f1');
assert.equal(els['detail-f1'].hidden, false);
assert.equal(els['detail-toggle-f1'].attrs['aria-expanded'], 'true');
assert.equal(els['detail-toggle-f1'].attrs['aria-label'], 'Hide summary and notes');
assert.match(c.detailToggleHtml(fight, true, false, false), /aria-expanded="true"/);
assert.doesNotMatch(c.detailBodyHtml(fight, true, false, ''), / hidden>/);

// toggling again closes it; a missing row (navigated away) must not throw
c.toggleFightDetail('f1');
assert.equal(els['detail-f1'].hidden, true);
assert.equal(els['detail-toggle-f1'].attrs['aria-expanded'], 'false');
assert.match(c.detailBodyHtml(fight, true, false, ''), / hidden>/);
c.toggleFightDetail('gone');
assert.equal(c.expandedSummaries.has('gone'), true);

// an open panel never leaks the summary into an unrated render of the same fight
c.toggleFightDetail('f1');
assert.doesNotMatch(c.detailBodyHtml(fight, false, false, ''), /Harrison/);
assert.doesNotMatch(c.detailToggleHtml(fight, false, false, false), /Harrison/);

console.log('summary: ok');
