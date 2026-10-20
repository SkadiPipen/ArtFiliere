const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  let navigated = 0, cleanup;
  const listeners = new Map();
  const modules = {
    react: { useEffect: effect => { cleanup = effect(); } },
    'react-native': { Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-router': { router: { replace: route => { assert.equal(route.pathname, '/(home)'); navigated++; } } },
    '@/context/CartContext': { useCart: () => ({ refreshCart: async () => { throw Error('Cart temporarily unavailable'); } }) },
    '@/firebase/config': { auth: { authStateReady: async () => {} } },
    '@/services/paymentReturn': { reconcilePaymentReturn: async () => true },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/PaymentReturnMonitor.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => modules[name],
    setInterval: () => 1, clearInterval() {},
    window: { addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
  });
  module.exports.default();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigated, 1, 'A cart refresh failure must not prevent return after verified payment');
  assert.ok(listeners.has('visibilitychange'), 'Returning to the app must trigger verification');
  cleanup();
  assert.equal(listeners.size, 0);
  console.log('PASS: verified payment returns home despite cart failure; visibility listener is cleaned up.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
