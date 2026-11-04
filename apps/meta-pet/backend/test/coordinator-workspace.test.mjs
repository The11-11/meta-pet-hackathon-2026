import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureSnapshots, validateReplacementProposal, saveCoordinationRun, applyCoordinationRun, assertAllowedSourcePath } from '../agent/coordination/workspace.mjs';
import { runApplyCoordination } from '../scripts/apply-coordination.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-coordination-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ['src', 'backend/src', 'backend/scripts', 'backend/test', 'backend/agent/team']) await fs.mkdir(path.join(root, directory), { recursive: true });
  await fs.writeFile(path.join(root, 'src/a.mjs'), 'export const a = 1;\n');
  await fs.writeFile(path.join(root, 'src/b.mjs'), 'export const b = 1;\n');
  return root;
}
function reviewed(snapshots, replacements) {
  return { version: 1, status: 'review_required', plan: { summary: 'Review a bounded source change.' }, proposal: { summary: 'Update explicit files.', changes: replacements.map(([sourcePath, content]) => ({ path: sourcePath, content, baseHash: snapshots.find(item => item.path === sourcePath).sha256 })), checks: ['backend-tests'], checksExecuted: false }, review: { verdict: 'ready_for_review', ownerApproved: false, independentlyCalled: true }, checksExecuted: false, changesApplied: false };
}
async function saved(root, sourcePaths = ['src/a.mjs'], replacements = [['src/a.mjs', 'export const a = 2;\n']]) {
  const snapshots = await captureSnapshots(root, sourcePaths);
  return { snapshots, ...await saveCoordinationRun(root, reviewed(snapshots, replacements), { snapshots }) };
}
const read = (root, sourcePath) => fs.readFile(path.join(root, sourcePath), 'utf8');

test('explicit bounded snapshots preserve original bytes and absent new files', async t => {
  const root = await fixture(t);
  const original = '\ufeffexport const a = 1;\r\n';
  await fs.writeFile(path.join(root, 'src/a.mjs'), original);
  const snapshots = await captureSnapshots(root, ['src/a.mjs', 'src/new.mjs']);
  assert.deepEqual(snapshots, [{ path: 'src/a.mjs', content: original, sha256: hash(original) }, { path: 'src/new.mjs', content: null, sha256: null }]);
  await assert.rejects(captureSnapshots(root, ['src/missing/new.mjs']), /ENOENT/);
  await assert.rejects(captureSnapshots(root, ['src/a.mjs', 'src\\a.mjs']), /Duplicate/);
});

test('traversal, private settings, authentication, policies, self-edits and non-source files are blocked', async t => {
  const root = await fixture(t);
  for (const sourcePath of ['../src/a.mjs', '/src/a.mjs', 'C:\\secret.mjs', '\\\\host\\share\\a.mjs', 'src/../backend/src/muse.mjs', 'src/.env', 'backend/.env', 'backend/src/auth.mjs', 'src/auth-destination.ts', 'src/AuthContext.tsx', 'src/auth-client.ts', 'src/authDestination.ts', 'src/app/auth/callback.tsx', 'src/AUTHCONTEXT.tsx', 'src/AuthClient.ts', 'src/authContext.tsx', 'src/session.ts', 'src/credentials.ts', 'src/private/setting.ts', 'backend/agent/team/index.mjs', 'backend/agent/coordination/workspace.mjs', 'backend/scripts/apply-coordination.mjs', 'backend/test/coordinator-workspace.test.mjs', 'src/AGENTS.md', 'src/policy.mjs', 'package.json', 'src/config.json', 'src/NUL.ts', 'src/foo.ts:secret', 'src/foo.ts ']) {
    assert.throws(() => assertAllowedSourcePath(sourcePath), undefined, sourcePath);
    await assert.rejects(captureSnapshots(root, [sourcePath]), undefined, sourcePath);
  }
  assert.equal(assertAllowedSourcePath('backend/src/muse.mjs'), 'backend/src/muse.mjs');
});

test('context rejects binary, invalid UTF-8, large files, aggregate excess and excess file counts', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'src/zero.mjs'), Buffer.from([65, 0, 66]));
  await fs.writeFile(path.join(root, 'src/invalid.mjs'), Buffer.from([0xc3, 0x28]));
  await fs.writeFile(path.join(root, 'src/large.mjs'), 'x'.repeat(64 * 1024 + 1));
  await assert.rejects(captureSnapshots(root, ['src/zero.mjs']), /Binary/);
  await assert.rejects(captureSnapshots(root, ['src/invalid.mjs']), /UTF-8/);
  await assert.rejects(captureSnapshots(root, ['src/large.mjs']), /64 KiB/);
  for (const letter of ['x', 'y', 'z']) await fs.writeFile(path.join(root, `src/${letter}.mjs`), letter.repeat(60 * 1024));
  await assert.rejects(captureSnapshots(root, ['src/x.mjs', 'src/y.mjs', 'src/z.mjs']), /160 KiB/);
  await assert.rejects(captureSnapshots(root, Array.from({ length: 9 }, (_, index) => `src/new${index}.mjs`)), /eight/);
});

test('a junction cannot expose source outside the workspace, even with an allowed-looking path', async t => {
  const root = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-coordination-external-'));
  t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.writeFile(path.join(external, 'plain.mjs'), 'private settings');
  try { await fs.symlink(external, path.join(root, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Host does not permit fixture links.'); return; } throw error; }
  await assert.rejects(captureSnapshots(root, ['src/linked/plain.mjs']), /links|junctions/);
  await assert.rejects(captureSnapshots(root, ['src/linked/new.mjs']), /links|junctions/);
});

test('replacement validation binds every exact path and base hash to explicit context and bounds new text', async t => {
  const root = await fixture(t);
  const snapshots = await captureSnapshots(root, ['src/a.mjs', 'src/new.mjs']);
  const proposal = reviewed(snapshots, [['src/a.mjs', 'updated\n'], ['src/new.mjs', 'new\n']]).proposal;
  const valid = validateReplacementProposal(proposal, snapshots);
  assert.equal(valid.changes[1].baseHash, null);
  for (const bad of [
    { ...proposal, changes: [{ ...proposal.changes[0], path: 'src/unlisted.mjs' }] },
    { ...proposal, changes: [{ ...proposal.changes[0], baseHash: '0'.repeat(64) }] },
    { ...proposal, changes: [{ ...proposal.changes[1], baseHash: '0'.repeat(64) }] },
    { ...proposal, changes: [proposal.changes[0], proposal.changes[0]] },
    { ...proposal, changes: [{ ...proposal.changes[0], content: 'x'.repeat(100 * 1024 + 1) }] },
    { ...proposal, changes: [{ ...proposal.changes[0], content: 'bad\0text' }] },
    { ...proposal, changes: [{ ...proposal.changes[0], content: '\ud800' }] },
    { ...proposal, changes: Array(6).fill(proposal.changes[0]) },
  ]) assert.throws(() => validateReplacementProposal(bad, snapshots));
  assert.throws(() => validateReplacementProposal(proposal, [{ ...snapshots[0], content: 'tampered' }]), /snapshot hash/);
});

test('saving creates reviewable plan, report, manifest and unified diff without applying changes', async t => {
  const root = await fixture(t);
  const result = await saved(root, ['src/a.mjs', 'src/new.mjs'], [['src/a.mjs', 'export const a = 2;\n'], ['src/new.mjs', 'export const c = 3;']]);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
  await assert.rejects(fs.access(path.join(root, 'src/new.mjs')), /ENOENT/);
  const manifestText = await fs.readFile(result.manifestPath, 'utf8');
  assert.equal(hash(manifestText), result.manifestSha256);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.ownerApproved, false);
  assert.equal(manifest.changesApplied, false);
  assert.equal(manifest.checksExecuted, false);
  const patch = await fs.readFile(result.patchPath, 'utf8');
  assert.match(patch, /--- a\/src\/a.mjs\n\+\+\+ b\/src\/a.mjs/);
  assert.match(patch, /--- \/dev\/null\n\+\+\+ b\/src\/new.mjs/);
  assert.match(patch, /No newline at end of file/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(result.runDir, 'plan.json'), 'utf8')), { summary: 'Review a bounded source change.' });
  await assert.rejects(saveCoordinationRun(root, reviewed(result.snapshots, [['src/a.mjs', 'x']]), { snapshots: result.snapshots, outputDir: '../external' }), /backend\/data\/coordination/);
});

test('apply requires exact operator approval and rejects artifact tampering before writing', async t => {
  const root = await fixture(t);
  const first = await saved(root);
  await assert.rejects(applyCoordinationRun(root, first.manifestPath), /Explicit/);
  await assert.rejects(applyCoordinationRun(root, first.manifestPath, '0'.repeat(64)), /Manifest changed/);
  await fs.appendFile(path.join(first.runDir, 'report.json'), 'tampered');
  await assert.rejects(applyCoordinationRun(root, first.manifestPath, first.manifestSha256), /artifact was modified/);
  const second = await saved(root);
  await fs.appendFile(second.patchPath, 'tampered');
  await assert.rejects(applyCoordinationRun(root, second.manifestPath, second.manifestSha256), /artifact was modified/);
  const third = await saved(root);
  await fs.appendFile(third.manifestPath, ' ');
  await assert.rejects(applyCoordinationRun(root, third.manifestPath, third.manifestSha256), /Manifest changed/);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
});

test('every supplied source hash and new-file absence is rechecked before the first write', async t => {
  const root = await fixture(t);
  const first = await saved(root, ['src/a.mjs', 'src/b.mjs']);
  await fs.writeFile(path.join(root, 'src/b.mjs'), 'changed after review\n');
  await assert.rejects(applyCoordinationRun(root, first.manifestPath, first.manifestSha256), /Source changed since review/);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
  await assert.rejects(fs.access(path.join(first.runDir, 'apply-journal.json')), /ENOENT/);
  const second = await saved(root, ['src/a.mjs', 'src/new.mjs'], [['src/a.mjs', 'updated\n'], ['src/new.mjs', 'new\n']]);
  await fs.writeFile(path.join(root, 'src/new.mjs'), 'external work\n');
  await assert.rejects(applyCoordinationRun(root, second.manifestPath, second.manifestSha256), /already exists/);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
  assert.equal(await read(root, 'src/new.mjs'), 'external work\n');
});

test('explicit apply writes only reviewed replacements, journals originals and cannot silently rerun', async t => {
  const root = await fixture(t);
  const result = await saved(root, ['src/a.mjs', 'src/new.mjs'], [['src/a.mjs', 'updated\n'], ['src/new.mjs', 'created\n']]);
  const applied = await applyCoordinationRun(root, result.manifestPath, result.manifestSha256);
  assert.deepEqual(applied.applied, ['src/a.mjs', 'src/new.mjs']);
  assert.equal(applied.checksExecuted, false);
  assert.equal(await read(root, 'src/a.mjs'), 'updated\n');
  assert.equal(await read(root, 'src/new.mjs'), 'created\n');
  assert.equal(await read(root, 'src/b.mjs'), 'export const b = 1;\n');
  const journal = JSON.parse(await fs.readFile(applied.journalPath, 'utf8'));
  assert.equal(journal.status, 'applied');
  assert.deepEqual(journal.originals, result.snapshots);
  await assert.rejects(applyCoordinationRun(root, result.manifestPath, result.manifestSha256), /already has an apply journal/);
});

test('a partial multi-file failure restores original bytes and journals rollback', async t => {
  const root = await fixture(t);
  const original = '\ufeffexport const a = 1;\r\n';
  await fs.writeFile(path.join(root, 'src/a.mjs'), original);
  const result = await saved(root, ['src/a.mjs', 'src/b.mjs'], [['src/a.mjs', 'updated\n'], ['src/b.mjs', 'second\n']]);
  await assert.rejects(applyCoordinationRun(root, result.manifestPath, result.manifestSha256, { beforeWrite({ index }) { if (index === 1) throw new Error('Synthetic disk failure.'); } }), /rolled back/);
  assert.equal(await read(root, 'src/a.mjs'), original);
  assert.equal(await read(root, 'src/b.mjs'), 'export const b = 1;\n');
  const journal = JSON.parse(await fs.readFile(path.join(result.runDir, 'apply-journal.json'), 'utf8'));
  assert.equal(journal.status, 'rolled_back');
  assert.deepEqual(journal.applied, ['src/a.mjs']);
  assert.deepEqual(journal.rollbackFailures, []);
});

test('rollback removes a newly created source file when a later change fails', async t => {
  const root = await fixture(t);
  const result = await saved(root, ['src/new.mjs', 'src/a.mjs'], [['src/new.mjs', 'new\n'], ['src/a.mjs', 'updated\n']]);
  await assert.rejects(applyCoordinationRun(root, result.manifestPath, result.manifestSha256, { beforeWrite({ index }) { if (index === 1) throw new Error('Synthetic disk failure.'); } }), /rolled back/);
  await assert.rejects(fs.access(path.join(root, 'src/new.mjs')), /ENOENT/);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
});

test('an unreviewed proposal cannot be applied even with an explicit manifest hash', async t => {
  const root = await fixture(t);
  const snapshots = await captureSnapshots(root, ['src/a.mjs']);
  const report = reviewed(snapshots, [['src/a.mjs', 'new\n']]);
  report.review.verdict = 'changes_requested';
  const result = await saveCoordinationRun(root, report, { snapshots });
  await assert.rejects(applyCoordinationRun(root, result.manifestPath, result.manifestSha256), /Only a reviewed/);
  assert.equal(await read(root, 'src/a.mjs'), 'export const a = 1;\n');
});

test('apply CLI help and malformed arguments do not load the workspace, environment or a model', async () => {
  let printed = ''; let error = '';
  const options = { root: path.join(os.tmpdir(), 'nonexistent-muse-test-root'), write: text => { printed += text; }, writeError: text => { error += text; } };
  assert.equal(await runApplyCoordination({ ...options, args: ['--help'] }), 0);
  assert.match(printed, /explicit|operator/i);
  for (const args of [['--artifact', 'x'], ['--approve', '0'.repeat(64)], ['--execute', 'test'], ['--artifact', 'x', '--artifact', 'y', '--approve', '0'.repeat(64)]]) assert.equal(await runApplyCoordination({ ...options, args }), 1);
  assert.match(error, /Apply stopped/);
});


test('hard links cannot expose or modify another file through an allowlisted source name', async t => {
  const root = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-coordination-hardlink-'));
  t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.writeFile(path.join(external, 'plain.mjs'), 'external private data');
  try { await fs.link(path.join(external, 'plain.mjs'), path.join(root, 'src/linked.mjs')); }
  catch (error) { if (['EPERM', 'EACCES', 'EXDEV', 'ENOTSUP'].includes(error.code)) { t.skip('Host does not permit fixture hard links.'); return; } throw error; }
  await assert.rejects(captureSnapshots(root, ['src/linked.mjs']), /hard links/);
  assert.equal(await fs.readFile(path.join(external, 'plain.mjs'), 'utf8'), 'external private data');
});

test('artifact output directories cannot be redirected through a junction', async t => {
  const root = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-coordination-artifacts-'));
  t.after(() => fs.rm(external, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'backend/data'), { recursive: true });
  try { await fs.symlink(external, path.join(root, 'backend/data/coordination'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Host does not permit fixture links.'); return; } throw error; }
  const snapshots = await captureSnapshots(root, ['src/a.mjs']);
  await assert.rejects(saveCoordinationRun(root, reviewed(snapshots, [['src/a.mjs', 'new\n']]), { snapshots }), /Artifact directories/);
  assert.deepEqual(await fs.readdir(external), []);
});

