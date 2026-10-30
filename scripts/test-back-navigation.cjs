// Run with: node scripts/test-back-navigation.cjs (uses existing TypeScript).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(name, imports = {}) {
  const filename = path.join(__dirname, '..', 'src', 'services', name + '.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(key => key in imports ? imports[key] : require(key), module, module.exports);
  return module.exports;
}

const history = load('backHistory');
function environment(store = new Map(), canBack = false) {
  global.window = { sessionStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) } };
  const calls = [];
  const navigation = load('navigation', {
    'expo-router': { router: { canGoBack: () => canBack, back: () => calls.push('back'), replace: route => calls.push(route) } },
    '@/firebase/config': { auth: { authStateReady: async () => {}, currentUser: { getIdToken: async () => 'test-token' } } },
    '@/services/api': { default: 'http://test.invalid' },
    './backHistory': history,
  });
  return { navigation, calls, store };
}

test('normal in-app navigation uses the existing navigator stack', () => {
  const { navigation, calls } = environment(new Map(), true);
  navigation.goBackOr('/profile');
  assert.deepEqual(calls, ['back']);
});

test('direct link without saved history goes to its parent', () => {
  const { navigation, calls } = environment();
  navigation.trackBackRoute('/reseller-verification', 'buyer');
  navigation.goBackOr('/(home)/profile');
  assert.deepEqual(calls, ['/(home)/profile']);
});

test('a fresh JS runtime after refresh returns to the saved previous page', () => {
  const first = environment();
  first.navigation.trackBackRoute('/profile', 'buyer');
  first.navigation.trackBackRoute('/reseller-verification', 'buyer');
  const refreshed = environment(first.store);
  refreshed.navigation.trackBackRoute('/reseller-verification', 'buyer');
  refreshed.navigation.goBackOr('/');
  assert.deepEqual(refreshed.calls, ['/profile']);
});

test('returning through multiple refreshed detail pages retains essential IDs', () => {
  const { navigation, calls } = environment();
  navigation.trackBackRoute('/artists', 'buyer');
  navigation.trackBackRoute('/artist-profile?artistId=7', 'buyer');
  navigation.trackBackRoute('/view-post?artworkId=37', 'buyer');
  navigation.goBackOr('/');
  navigation.trackBackRoute('/artist-profile?artistId=7', 'buyer');
  navigation.goBackOr('/');
  assert.deepEqual(calls, ['/artist-profile?artistId=7', '/artists']);
});

test('separate accounts cannot inherit one another\'s navigation trail', () => {
  const { navigation, calls } = environment();
  navigation.trackBackRoute('/admin-dashboard', 'admin');
  navigation.trackBackRoute('/reseller-approvals', 'admin');
  navigation.trackBackRoute('/reseller-verification', 'buyer');
  navigation.goBackOr('/profile');
  assert.deepEqual(calls, ['/profile']);
});

test('external, login and malformed routes are never return destinations', () => {
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/login', '/sign-up', '/rider/login', '/royalty-payment-return?token=x', null]) {
    assert.equal(history.safeInternalRoute(value), false);
  }
  assert.deepEqual(history.cleanHistory(['https://example.com', '/profile']), ['/profile']);
});

test('back then forward does not build a two-page loop', () => {
  let trail = [];
  for (const route of ['/profile', '/settings', '/reseller-verification', '/settings', '/profile']) {
    trail = history.recordRoute(trail, route);
  }
  assert.deepEqual(trail, ['/profile']);
});

test('login clears the return trail and history stays bounded', () => {
  assert.deepEqual(history.recordRoute(['/profile', '/settings'], '/login'), []);
  let trail = [];
  for (let id = 0; id < 100; id++) trail = history.recordRoute(trail, '/view-post?artworkId=' + id);
  assert.equal(trail.length, 30);
});

test('disabled storage still has a working parent fallback', () => {
  const { navigation, calls } = environment();
  window.sessionStorage.getItem = () => { throw Error('blocked'); };
  window.sessionStorage.setItem = () => { throw Error('blocked'); };
  navigation.trackBackRoute('/purchases');
  navigation.goBackOr('/profile');
  assert.deepEqual(calls, ['/profile']);
});

test('role-aware review fallback selects the correct staff dashboard', async () => {
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ role: 'hr' }) });
    const { navigation, calls } = environment();
    navigation.trackBackRoute('/reseller-approvals', 'hr');
    await navigation.goBackToWorkspace();
    assert.deepEqual(calls, ['/hr-dashboard']);
    assert.equal(history.workspaceForRole('platform_admin'), '/admin-dashboard');
    assert.equal(history.workspaceForRole('creative_moderator'), '/moderator-dashboard');
    assert.equal(history.workspaceForRole('customer_support'), '/customer-service-dashboard');
    assert.equal(history.workspaceForRole('driver'), '/rider/(tabs)');
  } finally { global.fetch = previousFetch; }
});

test('profile lookup failure does not leave the back button inert', async () => {
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => { throw Error('offline'); };
    const { navigation, calls } = environment();
    await navigation.goBackToWorkspace();
    assert.deepEqual(calls, ['/(home)/profile']);
  } finally { global.fetch = previousFetch; }
});

test('the saved parameter allowlist excludes documents, tokens and form input', () => {
  for (const name of ['token', 'image', 'password', 'terms', 'email', 'signature', 'bir_certificate']) {
    assert.equal(history.historyParamNames.includes(name), false);
  }
});
