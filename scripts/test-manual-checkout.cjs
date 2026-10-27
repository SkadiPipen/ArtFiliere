// Exercise the real checkout component with mocked rendering and network boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const requests = [], redirects = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'react': { useState: initial => [initial, () => {}], useRef: value => ({ current: value }), useEffect: effect => effect() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: 'web' }, View: 'view', Text: 'text', TouchableOpacity: 'button', ActivityIndicator: 'loading' },
    '@/firebase/config': { auth: { currentUser: { getIdToken: async () => 'test-token' } } },
    '@/services/api': { __esModule: true, default: 'http://api.test' },
    '@/module/cart/components/AuctionDeliveryCheckout': { __esModule: true, default: () => null },
    './contracts': { readApiResponse: response => response.json() },
    '@/services/paymentReturn': { preparePaymentWindow: () => ({ close() {} }), openPaymentCheckout: async url => redirects.push(url) },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/module/chat-negotiations/AutomaticCheckout.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports, module, require: name => { assert.ok(modules[name], `Unexpected dependency ${name}`); return modules[name]; },
    window: { location: { assign: url => redirects.push(url) } },
    fetch: async (url, options) => { requests.push({ url, ...options }); return { json: async () => options.method === 'GET' ? { is_auction: false } : { checkout_url: 'https://payment.test/checkout', payment_id: 42 } }; },
  });
  const tree = module.exports.default({ id: 42 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 0, 'Rendering a signed agreement must not initiate checkout');
  assert.equal(redirects.length, 0, 'Rendering must not open Xendit');
  const findButton = node => Array.isArray(node) ? node.map(findButton).find(Boolean) : node && typeof node === 'object' ? node.type === 'button' ? node : findButton(node.props?.children) : null;
  const button = findButton(tree);
  assert.ok(button, 'A separate checkout button is required');
  button.props.onPress();
  button.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests.map(r => r.method), ['GET', 'POST'], 'Only a buyer click should start one checkout, even on double-click');
  assert.deepEqual(redirects, ['https://payment.test/checkout']);
  console.log('PASS: no checkout on mount; explicit click opens one checkout; double-click is guarded.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
