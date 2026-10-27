const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const refs = [], states = [], effects = [], frames = new Map(), calls = [];
let r = 0, s = 0, e = 0, next = 0;
const react = {
  useRef(value) { const i = r++; return refs[i] ||= { current: value }; },
  useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], v => states[i] = v]; },
  useEffect(fn, deps) { const i = e++; if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j])) { effects[i]?.cleanup?.(); effects[i] = { fn, deps, pending: true }; } },
};
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/useChatAutoScroll.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports: api, require: () => react,
  requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
  cancelAnimationFrame: id => frames.delete(id),
});
function render(key = 'a') {
  r = s = e = 0;
  const hook = api.default(key);
  hook.ref.current = { scrollToEnd: options => calls.push(options.animated) };
  effects.forEach(effect => { if (effect.pending) { effect.pending = false; effect.cleanup = effect.fn(); } });
  return hook;
}
function flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
let hook = render();
hook.onContentSizeChange(); flush();
assert.deepEqual(calls, [false], 'Open at latest without animation');
hook.onContentSizeChange(); flush();
assert.equal(calls.at(-1), true, 'Follow incoming content');
hook.onScroll({ nativeEvent: { contentSize: { height: 2000 }, layoutMeasurement: { height: 500 }, contentOffset: { y: 200 } } });
hook = render();
assert.equal(hook.atLatest, false);
const before = calls.length;
hook.onContentSizeChange(); flush();
assert.equal(calls.length, before, 'Preserve position while reading history');
hook.scrollToLatest(); flush();
assert.equal(calls.length, before + 1, 'Explicit latest returns to bottom');
hook.onContentSizeChange(); flush();
assert.equal(calls.length, before + 2, 'Resume following');
hook = render('b'); flush();
assert.equal(calls.at(-1), false, 'New conversation opens at latest');
console.log('Chat auto-scroll checks passed.');
