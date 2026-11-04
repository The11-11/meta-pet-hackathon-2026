import test from 'node:test';
import assert from 'node:assert/strict';
import { connectOnboardingMuse, onboardingConnectionAddress, onboardingPreviewMode } from '../../src/onboardingConnection.ts';

function fixture(overrides = {}) {
  const state = { session: 4, current: true, checks: 0 };
  return { state, options: {
    address: '  http://localhost:8787/// ', token: ' preview-only-token ',
    activate: async () => { state.session += 1; },
    getSession: () => state.session, isCurrentOwner: () => state.current,
    check: async () => { state.checks += 1; return { verified: true, message: 'Ready.' }; },
    ...overrides,
  } };
}

test('preview connection validates the destination before activation or provider work', async () => {
  assert.equal(onboardingConnectionAddress(' https://muse.example/care/// '), 'https://muse.example/care');
  for (const address of ['', 'file:///private', 'https://user:password@muse.example', 'https://muse.example?token=secret', 'https://muse.example#secret']) {
    let activations = 0;
    const { state, options } = fixture({ address, activate: async () => { activations += 1; } });
    await assert.rejects(connectOnboardingMuse(options), /valid Muse server address/);
    assert.equal(activations, 0);
    assert.equal(state.checks, 0);
  }
});

test('preview check waits for ordered activation and uses the exact normalized session details', async () => {
  let finishActivation;
  const activation = new Promise(resolve => { finishActivation = resolve; });
  const events = [];
  const { state, options } = fixture();
  options.activate = async (address, token) => {
    events.push('activate');
    assert.equal(address, 'http://localhost:8787');
    assert.equal(token, 'preview-only-token');
    await activation;
    state.session += 1;
    events.push('saved');
  };
  options.check = async (address, token, transport) => {
    events.push('check');
    assert.equal(address, 'http://localhost:8787');
    assert.equal(token, 'preview-only-token');
    assert.deepEqual(transport, { credentials: 'omit' });
    return { verified: true, message: 'Live Muse responded.' };
  };
  const checking = connectOnboardingMuse(options);
  assert.deepEqual(events, ['activate']);
  finishActivation();
  assert.deepEqual(await checking, { verified: true, message: 'Live Muse responded.' });
  assert.deepEqual(events, ['activate', 'saved', 'check']);
});

test('failed connection activation never contacts the provider', async () => {
  const { state, options } = fixture({ activate: async () => { throw new Error('Could not save this preview.'); } });
  await assert.rejects(connectOnboardingMuse(options), /Could not save this preview/);
  assert.equal(state.checks, 0);
});

test('an owner change before activation or during its save blocks the provider check', async () => {
  const before = fixture();
  before.state.current = false;
  let activated = false;
  before.options.activate = async () => { activated = true; };
  await assert.rejects(connectOnboardingMuse(before.options), /account changed/);
  assert.equal(activated, false);
  const during = fixture();
  during.options.activate = async () => { during.state.session += 1; during.state.current = false; };
  await assert.rejects(connectOnboardingMuse(during.options), /preview or Muse connection changed/);
  assert.equal(during.state.checks, 0);
});

test('a changed Muse session during activation blocks a stale provider check', async () => {
  const { state, options } = fixture();
  options.activate = async () => { state.session += 2; };
  await assert.rejects(connectOnboardingMuse(options), /preview or Muse connection changed/);
  assert.equal(state.checks, 0);
});

test('owner or session changes during the provider check cannot show a stale success', async () => {
  for (const change of [state => { state.current = false; }, state => { state.session += 1; }]) {
    const { state, options } = fixture();
    options.check = async () => { change(state); return { verified: true, message: 'Stale success.' }; };
    await assert.rejects(connectOnboardingMuse(options), /preview or Muse connection changed/);
  }
});

test('the real check client sends only an empty check body, never a photo or pet record', async context => {
  const { options } = fixture();
  delete options.check;
  let observed;
  context.mock.method(globalThis, 'fetch', async (url, request) => {
    observed = { url, request };
    return Response.json({ verified: true, message: 'Meta Muse responded successfully.' });
  });
  const result = await connectOnboardingMuse(options);
  assert.equal(result.verified, true);
  assert.equal(observed.url, 'http://localhost:8787/api/muse/check');
  assert.equal(observed.request.body, '{}');
  assert.equal(observed.request.credentials, 'omit');
  assert.deepEqual(observed.request.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer preview-only-token' });
});

test('an unverified provider result stays unverified and errors remain failures', async () => {
  const { options } = fixture({ check: async () => ({ verified: false, message: 'Configure the provider first.' }) });
  assert.deepEqual(await connectOnboardingMuse(options), { verified: false, message: 'Configure the provider first.' });
  const failing = fixture({ check: async () => { throw new Error('The session token is invalid.'); } });
  await assert.rejects(connectOnboardingMuse(failing.options), /session token is invalid/);
});


test('public HTTPS onboarding selects Facebook guidance while developer endpoints keep token setup',()=>{
 assert.equal(onboardingPreviewMode('https://petaverse-meta-pet-demo.vercel.app'),'facebook');
 assert.equal(onboardingPreviewMode('https://public-auth.example'),'facebook');
 assert.equal(onboardingPreviewMode('https://petaverse-meta-pet-demo.vercel.app',true),'guide');
 for(const address of ['http://localhost:8787','http://127.0.0.1:8787','https://localhost:8787','https://preview.local','https://10.0.0.8:8787','https://192.168.1.8:8787','https://172.16.4.1:8787','https://[::1]:8787']){
  assert.equal(onboardingPreviewMode(address),'development',address);
 }
 for(const address of ['','not-a-url','file:///private','https://user:password@public-auth.example']) assert.equal(onboardingPreviewMode(address),'guide');
});
