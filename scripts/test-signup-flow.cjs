const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function scenario(upload, google = false) {
  const state = []; let cursor = 0, registrations = 0;
  const requests = [];
  const user = { uid: 'buyer', email: 'google@test.com', displayName: 'Google Buyer', getIdToken: async () => 'test-token' };
  const defaults = { username: 'buyer', email: 'buyer@test.com', password: 'secret123', confirmPassword: 'secret123', firstName: 'New', middleName: '', lastName: 'Buyer', dateOfBirth: '2000-01-01', contactNumber: '09123456789', street: 'Street', barangay: 'Barangay', city: 'City', province: 'Province', region: 'Region', postalCode: '6000', wantsRoyalty: 'no', profileImage: '' };
  const typeModule = { exports: {} };
  vm.runInNewContext(compile('src/module/auth/sign-up/types.ts'), { exports: typeModule.exports, module: typeModule });
  const modules = {
    react: {
      useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
      useRef: initial => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'Image', 'ActivityIndicator'].map(x => [x, x])),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/firebase/config': { auth: { currentUser: user } },
    '@/services/api': { default: 'http://test' },
    '@/services/auth': { registerUser: async () => { registrations++; return user; }, loginUser: async () => user },
    '@/services/googleSignUp': { googleSignUp: async () => user },
    '@/module/settings/settingsApi': { pickSettingsImage: async () => 'data:image/png;base64,test-photo' },
    '@/constants/colors': { COLORS: {} },
    '@/module/auth/sign-up/types': { ...typeModule.exports, INITIAL_SIGN_UP_FORM_DATA: defaults },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compile('src/module/auth/SignUpScreen.tsx'), {
    exports: mod.exports, module: mod,
    require: name => modules[name] || { default: name },
    fetch: async (url, options) => { if (url.endsWith('/auth/me/')) return { ok: false, status: 404 }; requests.push({ url, options }); return { ok: true, json: async () => ({ id: 1 }) }; },
  });
  const render = () => { cursor = 0; return mod.exports.default(); };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const button = (tree, label) => nodes(tree).find(node => node.type === 'Pressable' && text(node) === label);
  if (google) {
    const account = nodes(render()).find(node => node.props?.onGoogleSignUp);
    await account.props.onGoogleSignUp();
    assert.equal(nodes(render()).find(node => node.props?.onGoogleSignUp).props.googleLinked, true);
  }
  for (let step = 1; step <= 3; step++) button(render(), 'Next').props.onPress();
  button(render(), 'Create Account').props.onPress();
  assert.equal(registrations, 0, 'Step 4 must show the optional photo screen before creating Firebase email identity');
  assert.equal(requests.length, 0, 'Step 4 must not create a platform account');
  let tree = render();
  assert.ok(button(tree, 'Upload profile photo'));
  if (upload) {
    await button(tree, 'Upload profile photo').props.onPress();
    await button(render(), 'Create Account').props.onPress();
  } else await button(tree, 'Skip and create account').props.onPress();
  assert.equal(registrations, google ? 0 : 1);
  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(Boolean(payload.profile_image), upload);
  assert.equal(payload.date_of_birth, '2000-01-01');
  assert.equal(payload.email, google ? 'google@test.com' : 'buyer@test.com');
  assert.equal(payload.password, undefined, 'Passwords must never be sent in platform registration payloads');
}
(async () => {
  await scenario(false);
  await scenario(true);
  await scenario(false, true);
  await scenario(true, true);
  console.log('PASS: signup waits for the photo step; skip omits photo; upload submits it; Google signup uses its verified session without creating a password account; passwords stay out of backend payload.');
})().catch(error => { console.error(error); process.exitCode = 1; });
