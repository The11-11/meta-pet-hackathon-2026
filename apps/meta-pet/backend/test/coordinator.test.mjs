import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { coordinateDevelopment, COORDINATION_LIMITS, validatePlan, validateProposal } from '../agent/coordination/coordinator.mjs';

const key = 'PRIVATE_SYNTHETIC_META_KEY';
const source = 'export const label = "old";\n';
const files = [{ path: 'src/example.ts', content: source, sha256: createHash('sha256').update(source).digest('hex') }];
const plan = { summary: 'Improve a small explicit source module.', tasks: [{ specialist: 'project-planning', task: 'Review the implementation approach.' }, { specialist: 'facebook_readiness_review', task: 'Check that account boundaries remain unchanged.' }], acceptanceCriteria: ['The label changes without adding access.'] };
const advice = { findings: 'The supplied source is a small module.', risks: ['Runtime behavior has not been tested.'], suggestions: ['Keep the change minimal.'] };
const proposal = { summary: 'Update the explicit label.', changes: [{ path: files[0].path, content: 'export const label = "new";\n' }], checks: ['frontend-lint', 'frontend-typecheck'] };
const review = { verdict: 'ready_for_review', summary: 'The exact proposed change matches the requested scope; no execution is claimed.', issues: [] };
const synthesis = { summary: 'A consolidated maintenance plan.', implementationSteps: ['Update the selected label.', 'Review the patch and run fixed project checks.'], acceptanceCriteria: ['The requested label is present.'] };
const completed = value => Response.json({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });

function provider(overrides = {}) {
  const seen = []; let active = 0; let peak = 0;
  return { seen, get peak() { return peak; }, async fetch(url, options) {
    const body = JSON.parse(options.body);
    const stage = /Stage: ([a-z]+)\./.exec(body.instructions)?.[1];
    seen.push({ url, options, body, stage });
    if (stage === 'consult') { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; }
    const result = overrides[stage];
    if (typeof result === 'function') return result(body, seen);
    if (result instanceof Response) return result;
    return completed(result ?? ({ plan, consult: advice, build: proposal, review, synthesize: synthesis }[stage]));
  } };
}
const options = stub => ({ request: 'Change this label for the maintenance demo.', mode: 'patch', files, apiKey: key, fetchImpl: stub.fetch.bind(stub) });

test('real coordination delegates parallel specialist requests before a separate builder and reviewer', async () => {
  const stub = provider(); const progress = [];
  const result = await coordinateDevelopment({ ...options(stub), onProgress: event => progress.push(event) });
  assert.equal(result.status, 'review_required');
  assert.equal(result.modelCalls, 5);
  assert.deepEqual(stub.seen.map(item => item.stage), ['plan', 'consult', 'consult', 'build', 'review']);
  assert.equal(stub.peak, 2);
  assert.equal(result.consultations.length, 2);
  assert.equal(result.review.independentlyCalled, true); assert.equal(result.review.ownerApproved, false);
  assert.equal(result.proposal.changes[0].baseHash, files[0].sha256);
  assert.equal(result.changesApplied, false); assert.equal(result.checksExecuted, false);
  assert.ok(result.receipts.every(item => item.status === 'completed'));
  assert.equal(progress.filter(item => item.status === 'completed').length, 5);
  for (const item of stub.seen) {
    assert.equal(item.url, 'https://api.meta.ai/v1/responses');
    assert.equal(item.options.headers.Authorization, 'Bearer ' + key);
    assert.equal(item.body.store, false); assert.equal(item.body.tools, undefined);
    assert.doesNotMatch(JSON.stringify(item.body), new RegExp(key));
    assert.match(item.body.instructions, /You have no tools/);
  }
});

test('plan mode synthesizes real specialist findings without proposing or applying code', async () => {
  const stub = provider();
  const result = await coordinateDevelopment({ ...options(stub), mode: 'plan', files: [] });
  assert.equal(result.status, 'plan_only'); assert.equal(result.modelCalls, 4);
  assert.equal(result.proposal, null); assert.equal(result.review, null);
  assert.deepEqual(result.synthesis, synthesis);
  assert.equal(stub.seen.at(-1).stage, 'synthesize');
  const payload = JSON.parse(stub.seen.at(-1).body.input[0].content);
  assert.equal(payload.consultations.length, 2);
});

test('three specialists remain bounded at six actual provider calls', async () => {
  const tasks = [...plan.tasks, { specialist: 'hackathon_fit', task: 'Review demo scope.' }];
  const stub = provider({ plan: { ...plan, tasks } });
  const result = await coordinateDevelopment(options(stub));
  assert.equal(result.modelCalls, COORDINATION_LIMITS.maxCalls);
  assert.equal(result.receipts.length, 6); assert.equal(stub.peak, 3);
});

test('an independent reviewer can block a patch while retaining a reviewable proposal', async () => {
  const stub = provider({ review: { verdict: 'changes_requested', summary: 'A regression needs correction.', issues: ['The selected acceptance check is not met.'] } });
  const result = await coordinateDevelopment(options(stub));
  assert.equal(result.status, 'changes_requested');
  assert.ok(result.proposal); assert.equal(result.changesApplied, false);
  assert.equal(result.review.ownerApproved, false);
});

test('planner cannot select pet roles, arbitrary agents, duplicate agents or too many agents', async () => {
  for (const tasks of [[{ specialist: 'nutrition', task: 'Access pet data.' }], [{ specialist: 'run_shell', task: 'Execute.' }], [plan.tasks[0], plan.tasks[0]], [...plan.tasks, { specialist: 'hackathon_fit', task: 'A' }, { specialist: 'build-review', task: 'B' }]]) {
    const stub = provider({ plan: { ...plan, tasks } });
    const result = await coordinateDevelopment(options(stub));
    assert.equal(result.status, 'failed'); assert.equal(stub.seen.length, 1);
    assert.equal(result.proposal, null);
  }
});

test('specialist failure stops building and reviewing without pretending all specialists succeeded', async () => {
  let number = 0;
  const stub = provider({ consult: () => ++number === 1 ? new Response('PRIVATE_PROVIDER_BODY', { status: 500 }) : completed(advice) });
  const result = await coordinateDevelopment(options(stub));
  assert.equal(result.status, 'failed'); assert.equal(stub.seen.length, 3);
  assert.equal(result.consultations.length, 1); assert.equal(result.proposal, null);
  assert.equal(result.receipts.filter(item => item.status === 'failed').length, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_BODY/);
});

test('builder may only propose explicit files and fixed check identifiers', async () => {
  for (const build of [
    { ...proposal, changes: [{ path: '../backend/.env', content: 'private' }] },
    { ...proposal, changes: [{ path: 'src/unrequested.ts', content: 'new' }] },
    { ...proposal, changes: [...proposal.changes, ...proposal.changes] },
    { ...proposal, changes: [{ path: files[0].path, content: source }] },
    { ...proposal, checks: ['run arbitrary shell'] },
    { ...proposal, checks: ['frontend-lint', 'frontend-lint'] },
  ]) {
    const stub = provider({ build });
    const result = await coordinateDevelopment(options(stub));
    assert.equal(result.status, 'failed'); assert.equal(stub.seen.length, 4);
    assert.equal(result.review, null); assert.equal(result.changesApplied, false);
  }
});

test('explicit new file snapshots preserve absence hashes for later guarded apply', async () => {
  const snapshots = [{ path: 'src/new-feature.ts', content: null, sha256: null }];
  const stub = provider({ build: { ...proposal, changes: [{ path: snapshots[0].path, content: 'export const enabled = true;\n' }] } });
  const result = await coordinateDevelopment({ ...options(stub), files: snapshots });
  assert.equal(result.status, 'review_required');
  assert.equal(result.proposal.changes[0].baseHash, null);
});

test('unfinished, malformed, refused or action-bearing provider responses fail without executing anything', async () => {
  const responses = [
    Response.json({ status: 'incomplete', incomplete_details: { reason: 'tokens' }, output: [] }),
    Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'run_shell', arguments: '{}' }] }),
    Response.json({ status: 'completed', output: [{ type: 'custom_tool_call', name: 'unavailable_tool' }] }),
    Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot do that.' }] }] }),
    Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{invalid}' }] }] }),
    new Response('PRIVATE_DIAGNOSTIC', { status: 401 }),
    new Response('not-json'),
  ];
  for (const response of responses) {
    const stub = provider({ plan: response });
    const result = await coordinateDevelopment(options(stub));
    assert.equal(result.status, 'failed'); assert.equal(result.modelCalls, 1);
    assert.equal(result.changesApplied, false); assert.equal(result.checksExecuted, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DIAGNOSTIC|run_shell/);
  }
});

test('credential echoes are discarded from model output and credentials in source context are rejected before any call', async () => {
  const stub = provider({ plan: { ...plan, summary: key } });
  const result = await coordinateDevelopment(options(stub));
  assert.equal(result.status, 'failed'); assert.doesNotMatch(JSON.stringify(result), new RegExp(key));
  const untouched = provider();
  await assert.rejects(coordinateDevelopment({ ...options(untouched), request: 'Please use ' + key }));
  await assert.rejects(coordinateDevelopment({ ...options(untouched), files: [{ ...files[0], content: key }] }));
  assert.equal(untouched.seen.length, 0);
});

test('invalid input, paths and source sizes fail before contacting Meta', async () => {
  const stub = provider();
  for (const extra of [{ request: '' }, { request: 'x'.repeat(4001) }, { mode: 'run' }, { mode: 'patch', files: [] }, { files: [{ ...files[0], path: '../secret.ts' }] }, { files: [{ ...files[0], path: 'C:/private.ts' }] }, { files: [{ ...files[0], path: 'src/file.ts:secret' }] }, { files: [{ ...files[0], content: '\u0000' }] }, { files: [{ ...files[0], content: 'x'.repeat(COORDINATION_LIMITS.maxContextBytes + 1) }] }]) await assert.rejects(coordinateDevelopment({ ...options(stub), ...extra }));
  assert.equal(stub.seen.length, 0);
});

test('cancellation never starts a provider call and progress logger failures do not corrupt coordination', async () => {
  const stub = provider();
  const cancelled = await coordinateDevelopment({ ...options(stub), signal: AbortSignal.abort() });
  assert.equal(cancelled.status, 'failed'); assert.equal(cancelled.modelCalls, 0);
  assert.equal(stub.seen.length, 0);
  const working = await coordinateDevelopment({ ...options(stub), onProgress() { throw new Error('logger failure'); } });
  assert.equal(working.status, 'review_required');
});

test('strict schemas reject hidden instructions as extra fields or a reviewer pretending owner approval', () => {
  assert.throws(() => validatePlan({ ...plan, shell: 'do something' }));
  assert.throws(() => validateProposal({ ...proposal, apply: true }, files));
});


test('coordinator CLI help and dry-run read no credential values and make no provider call', async context => {
  const { runCoordination, parseCoordinationArgs } = await import('../scripts/coordinate.mjs');
  const fs = await import('node:fs/promises'); const path = await import('node:path'); const { tmpdir } = await import('node:os');
  const prefix = path.join(tmpdir(), 'muse-coordinator-cli-'); const root = await fs.mkdtemp(prefix);
  context.after(async () => { assert.ok(root.startsWith(prefix)); await fs.rm(root, { recursive: true, force: true }); });
  await fs.mkdir(path.join(root, 'src')); await fs.writeFile(path.join(root, 'src/example.ts'), source);
  const env = new Proxy({}, { get() { throw new Error('Credentials must not be read.'); } });
  for (const args of [['--help'], ['--dry-run', '--request', 'Inspect this source.', '--file', 'src/example.ts']]) {
    const output = [];
    const result = await runCoordination({ args, root, env, fetchImpl() { throw new Error('Provider must not be called.'); }, write: value => output.push(value) });
    assert.equal(result, 0);
    if (args.includes('--dry-run')) { const value = JSON.parse(output[0]); assert.equal(value.providerContacted, false); assert.equal(value.status, 'dry_run'); assert.equal(value.files[0].path, 'src/example.ts'); }
  }
  for (const args of [['--run', 'shell'], ['--mode', 'patch', '--request', 'Do this'], ['--request', 'A', '--request', 'B'], ['--dry-run', '--dry-run', '--request', 'A']]) assert.throws(() => parseCoordinationArgs(args));
});

test('coordinator CLI writes real review artifacts while leaving source untouched', async context => {
  const { runCoordination } = await import('../scripts/coordinate.mjs');
  const fs = await import('node:fs/promises'); const path = await import('node:path'); const { tmpdir } = await import('node:os');
  const prefix = path.join(tmpdir(), 'muse-coordinator-artifact-'); const root = await fs.mkdtemp(prefix);
  context.after(async () => { assert.ok(root.startsWith(prefix)); await fs.rm(root, { recursive: true, force: true }); });
  await fs.mkdir(path.join(root, 'src')); await fs.writeFile(path.join(root, 'src/example.ts'), source);
  const stub = provider(); let output;
  const code = await runCoordination({ args: ['--mode', 'patch', '--request', 'Change the selected label.', '--file', 'src/example.ts'], root, env: { MODEL_API_KEY: key, FACEBOOK_CLIENT_SECRET: 'ANOTHER_PRIVATE_SECRET' }, fetchImpl: stub.fetch.bind(stub), writeProgress() {}, write: value => { output = JSON.parse(value); } });
  assert.equal(code, 0); assert.equal(output.status, 'review_required'); assert.equal(output.modelCalls, 5);
  assert.equal(await fs.readFile(path.join(root, 'src/example.ts'), 'utf8'), source);
  const manifest = await fs.readFile(output.artifact.manifestPath, 'utf8');
  const report = await fs.readFile(path.join(output.artifact.runDir, 'report.json'), 'utf8');
  assert.doesNotMatch(manifest + report + JSON.stringify(output), /PRIVATE_SYNTHETIC_META_KEY|ANOTHER_PRIVATE_SECRET/);
  assert.equal(JSON.parse(manifest).ownerApproved, false);
  assert.match(await fs.readFile(output.artifact.patchPath, 'utf8'), /export const label = "new"/);
});

test('CLI rejects private source paths and output folders before reading credentials or invoking Meta', async context => {
  const { runCoordination } = await import('../scripts/coordinate.mjs');
  const fs = await import('node:fs/promises'); const path = await import('node:path'); const { tmpdir } = await import('node:os');
  const prefix = path.join(tmpdir(), 'muse-coordinator-blocked-'); const root = await fs.mkdtemp(prefix);
  context.after(async () => { assert.ok(root.startsWith(prefix)); await fs.rm(root, { recursive: true, force: true }); });
  const env = new Proxy({}, { get() { throw new Error('No credentials before input validation.'); } });
  for (const args of [['--request', 'Inspect it.', '--file', 'backend/.env'], ['--request', 'Inspect it.', '--output-dir', '../outside']]) {
    await assert.rejects(runCoordination({ args, root, env, fetchImpl() { throw new Error('No provider call.'); }, write() {} }), error => !/No credentials|No provider/.test(error.message));
  }
});

