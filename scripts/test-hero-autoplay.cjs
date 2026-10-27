const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const state = [], refs = [], effects = [], calls = [], timers = new Map();
let stateCursor = 0, refCursor = 0, effectCursor = 0, nextTimer = 0;
const featured = [{id:'popular',kind:'popular',badge:'POPULAR'},{id:'artist',kind:'artist',badge:'ARTIST'}];
const react = {
  useState(initial) { const index = stateCursor++; if (!(index in state)) state[index] = index === 1 ? featured : typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
  useRef(initial) { const index = refCursor++; return refs[index] || (refs[index] = {current:initial}); },
  useEffect(fn, deps) { const index = effectCursor++; const old = effects[index]; if (!old || deps.some((value, i) => value !== old.deps[i])) effects[index] = {fn, deps, pending:true}; },
};
const jsx = (type, props) => ({type, props});
const api = {};
const modules = {
  react, 'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{FlatList:'FlatList',View:'View',StyleSheet:{create:style=>style},useWindowDimensions:()=>({width:900})},
  '@/components/Typography':{}, 'expo-linear-gradient':{}, 'expo-router':{}, '@/services/api':'http://test',
  '@/module/chat-negotiations/contracts':{}, './AuctionSection':{},
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/module/home/components/HeroCarousel.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText, {
  exports:api, require:name=>name.endsWith('.png')?1:modules[name],
  setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;}, clearTimeout:id=>timers.delete(id),
});
function render() {
  stateCursor=refCursor=effectCursor=0;
  const tree=api.default({onSelect(){}});
  const list=tree.props.children[0];
  list.props.ref.current={scrollToOffset:args=>calls.push(args)};
  for(let index=0;index<effects.length;index++) if(index!==1 && effects[index].pending) { effects[index].pending=false;effects[index].fn(); }
  return list;
}
function fire(ms) {
  const entry=[...timers].find(([,timer])=>timer.ms===ms);
  assert.ok(entry, `Expected a ${ms}ms timer`);
  timers.delete(entry[0]);entry[1].fn();
}
let list=render();
assert.equal(list.props.data.length,6);
assert.equal(list.props.renderItem({item:featured[0]}).props.onHoverIn,undefined,'Hover must not freeze autoplay');
for(let step=0;step<7;step++) {
  fire(4500);list=render();
  assert.equal(calls.filter(call=>call.animated).at(-1).offset,((step%3)+1)*900);
  // Deliberately omit momentum-end to reproduce browser smooth-scroll behavior.
  fire(1200);list=render();
}
list.props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:900}}});
assert.equal([...timers.values()].filter(timer=>timer.ms===1200).length,0);
console.log('PASS: autoplay survives seven advances without momentum events, loops left, clears transition locks, and does not pause on hover.');
