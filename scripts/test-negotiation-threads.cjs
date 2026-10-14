const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the pure timeline helper without starting Expo or touching Firebase.
const source = fs.readFileSync('src/module/chat-negotiations/negotiationThreads.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { buildChatTimeline, contractChanges, legacyChanges } = context.exports;
const proposal = (id, artwork_id, price, created_at, extra = {}) => ({ id, artwork_id, price, created_at, title: 'Same title', buyer_uid: 'buyer', artist_uid: 'artist', buyer: 'Buyer', artist: 'Artist', terms: 'Personal use', status: 'proposed', ...extra });
const message = (id, artworkId, timestamp, finalPrice) => ({ id, artworkId, timestamp, type: 'negotiation', senderId: 'buyer', senderName: 'Buyer', text: '', read: true, negotiationData: { proposal: { artworkId, finalPrice } } });
const first = proposal(1, 10, '100', '2026-10-01T10:00:00Z', { status: 'cancelled' });
const counter = proposal(2, 10, '150', '2026-10-02T10:00:00Z', { revision_of: 1, status: 'cancelled' });
const final = proposal(3, 10, '125', '2026-10-03T10:00:00Z', { revision_of: 2, status: 'accepted' });
const other = proposal(4, 20, '200', '2026-10-02T12:00:00Z');
const text = { id: 'text', text: 'Keep this message', type: 'text', timestamp: '2026-10-02T11:00:00Z', senderId: 'artist', senderName: 'Artist', read: true };
const old = message('old', '10', '2026-09-30T10:00:00Z', 90);
const contracts = [final, first, other, counter];
const messages = [text, old];
const original = JSON.stringify({ contracts, messages });
let timeline = buildChatTimeline(messages, contracts);
assert.equal(timeline.length, 3, 'One card per artwork plus ordinary messages');
const thread = timeline.find(row => row.contract?.artwork_id === 10);
assert.equal(thread.contract.id, 3, 'Only latest attempt receives actions');
assert.equal(thread.contractHistory.map(row => row.id).join(','), '1,2,3', 'All closed attempts remain in chronological history');
assert.equal(thread.legacyHistory[0].id, 'old', 'Legacy Firestore attempts are retained inside the same card');
assert.equal(timeline[0].id, thread.id, 'Card keeps the position of its first attempt');
assert.equal(timeline.find(row => row.id === 'text').text, text.text, 'Ordinary chat is unchanged');
assert.equal(JSON.stringify({ contracts, messages }), original, 'Grouping never mutates stored input records');
assert.equal(contractChanges(final, counter).find(change => change.label === 'Checkout total (PHP)').before, '150');
assert.equal(contractChanges(final, counter).find(change => change.label === 'Checkout total (PHP)').after, '125');
assert.equal(buildChatTimeline([message('a', 1, '', 10), message('b', 1, '', 20)], []).length, 1, 'Legacy-only attempts also share one card');
assert.equal(legacyChanges(message('b', 1, '', 20), message('a', 1, '', 10))[0].after, '20');
assert.equal(buildChatTimeline([message('a', undefined, '', 10), message('b', undefined, '', 20)], []).length, 2, 'Unknown artwork IDs are not incorrectly merged');
const stable = buildChatTimeline(messages, [...contracts, proposal(5, 10, '130', '2026-10-04T10:00:00Z')]);
assert.equal(stable.find(row => row.contract?.artwork_id === 10).id, thread.id, 'Revision updates preserve the card identity');
assert.equal(buildChatTimeline([], []).length, 0);
const cancelledSession = [
  { ...first, negotiation_key: 'closed-session' },
  { ...counter, negotiation_key: 'closed-session', closure_reason: 'cancelled' },
];
const newSession = { ...final, negotiation_key: 'new-session', revision_of: undefined, status: 'proposed' };
const separate = buildChatTimeline([], [...cancelledSession, newSession]);
assert.equal(separate.length, 2, 'Restarting a cancelled negotiation creates a separate card for the same artwork');
assert.equal(separate.find(row => row.contract.id === 2).contractHistory.length, 2, 'Cancelled card keeps its original attempts');
assert.equal(separate.find(row => row.contract.id === 3).contractHistory.length, 1, 'New card starts its own attempt history');
assert.equal(buildChatTimeline([old], [...cancelledSession, newSession]).find(row => row.contract.id === 2).legacyHistory.length, 1, 'Old Firestore proposals stay with the original session');
const inlineSource = fs.readFileSync('src/module/chat-negotiations/inlineChanges.ts', 'utf8');
const inlineContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(inlineSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, inlineContext);
const { inlineChanges, compactChanges } = inlineContext.exports;
for (const [before, after] of [['License: personal use', 'License: commercial use'], ['', 'Added term'], ['Removed term', ''], ['PHP 100', 'PHP 200'], ['Same', 'Same']]) {
  const spans = inlineChanges(before, after);
  assert.equal(spans.filter(span => span.kind !== 'added').map(span => span.text).join(''), before, 'Removed spans reconstruct the prior wording');
  assert.equal(spans.filter(span => span.kind !== 'removed').map(span => span.text).join(''), after, 'Added spans reconstruct current wording');
}
const compact = compactChanges('Title: Art\nPrice: 100\nArtist: Jane', 'Title: Art\nPrice: 200\nArtist: Jane');
assert.equal(compact.length, 1, 'Unchanged terms lines are not repeated in change highlights');
assert.equal(compact[0].filter(span => span.kind === 'added').map(span => span.text).join(''), '200');
process.stdout.write('Negotiation grouping, history, change highlighting and record-preservation checks passed.\n');
