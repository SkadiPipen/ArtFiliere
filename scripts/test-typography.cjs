const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {};
const nativeText = function NativeText() {};
const nativeInput = function NativeInput() {};
const context = {};
const mocks = {
  react: { createContext: () => context, forwardRef: fn => fn, useContext: () => undefined },
  'react-native': { Text: nativeText, TextInput: nativeInput, StyleSheet: { flatten } },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
};
const api = {};
const code = ts.transpileModule(fs.readFileSync('src/components/Typography.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports: api, require: name => name.endsWith('.ttf') ? name : mocks[name] });
const textStyle = style => flatten(api.Text({ style, children: 'Preview' }, null).props.children.props.style);
assert.equal(textStyle({fontSize:28,fontWeight:'700'}).fontFamily, 'LoraSemiBold');
assert.equal(textStyle({fontSize:24}).fontFamily, 'Lora');
assert.equal(textStyle({fontSize:14}).fontFamily, 'NunitoSans');
assert.equal(textStyle({fontSize:14,fontWeight:'600'}).fontFamily, 'NunitoSansSemiBold');
assert.equal(textStyle({fontSize:14,fontWeight:'700'}).fontFamily, 'NunitoSansBold');
assert.equal(textStyle({fontFamily:'monospace',fontWeight:'700'}).fontWeight, '700');
const ref = {};
const input = api.TextInput({secureTextEntry:true,style:{fontSize:14},accessibilityLabel:'Password'},ref);
assert.equal(flatten(input.props.style).fontFamily,'NunitoSans');
assert.equal(input.props.secureTextEntry,true);
assert.equal(input.props.ref,ref);
assert.equal(input.props.accessibilityLabel,'Password');
for (const name of ['Lora_400Regular','Lora_600SemiBold','NunitoSans_400Regular','NunitoSans_600SemiBold','NunitoSans_700Bold']) {
  assert.equal(fs.readFileSync(`assets/fonts/${name}.ttf`).readUInt32BE(0),0x00010000);
}
console.log('PASS: heading/body weights, explicit fonts, input refs and accessibility, and bundled TTF assets.');
