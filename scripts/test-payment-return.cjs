const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
async function main() {
  let status = 'pending', closed = 0, focused = 0;
  const requests = [], storage = new Map();
  const auth = { currentUser: { uid: 'buyer' } };
  const tab = { opener: {}, document: {}, location: {}, close() { closed++; } };
  const modules = {
    'react-native': { Platform: { OS: 'web' } },
    '@/firebase/config': { auth },
    './purchases': { purchaseRequest: async (path, method) => { requests.push({ path, method }); return { status }; } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/services/paymentReturn.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, require: name => modules[name],
    window: { open: () => tab, focus: () => focused++ },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  const api = module.exports;
  await api.openPaymentCheckout('https://payment.test/checkout', 'shop', 7, api.preparePaymentWindow());
  assert.equal(tab.location.href, 'https://payment.test/checkout');
  assert.equal(await api.reconcilePaymentReturn(), false, 'Pending payment must not trigger homepage return');
  assert.equal(closed, 0);
  status = 'paid';
  assert.equal(await api.reconcilePaymentReturn(), true);
  assert.equal(closed, 1); assert.equal(focused, 1); assert.equal(storage.size, 0);
  assert.equal(await api.reconcilePaymentReturn(), false, 'A confirmed return must be consumed once');
  assert.ok(requests.every(r => r.path === 'payments/7/refresh/' && r.method === 'POST'));
  console.log('PASS: payment tab closes only after authenticated payment verification; pending payment stays open; return is consumed once.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
