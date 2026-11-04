import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';

export const COORDINATION_WORKSPACE_LIMITS = Object.freeze({ maxFiles: 8, maxFileBytes: 64 * 1024, maxTotalBytes: 160 * 1024, maxChanges: 5, maxNewTextBytes: 100 * 1024 });
const SOURCE_PREFIXES = ['src/', 'components/', 'hooks/', 'constants/', 'lib/', 'utils/', 'backend/src/', 'backend/agent/', 'backend/scripts/', 'backend/test/'];
const SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|ts|tsx|css|scss)$/i;
const PRIVATE_SEGMENT = /^(?:auth(?:entication|orization)?|credentials?|secrets?|sessions?|private|polic(?:y|ies)|instructions?|AGENTS|SECURITY)(?:[._-]|$)/i;
const AUTH_SEGMENT = /^auth/i;
const SELF_PATH = /^(?:backend\/agent\/(?:coordination|team)(?:\/|$)|backend\/(?:scripts|test)\/[^/]*coordinat[^/]*$)/i;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const isInside = (base, candidate) => { const relative = path.relative(base, candidate); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function assertAllowedSourcePath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\x00-\x1f:*?"<>|]/.test(value) || path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) fail('Expected a relative, allowed source file path.');
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.') || /[. ]$/.test(segment) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment) || PRIVATE_SEGMENT.test(segment) || AUTH_SEGMENT.test(segment) || /^(?:node_modules|data|dist|build|coverage)$/i.test(segment))) fail('Private, traversal, generated, or policy paths are not allowed.');
  if (!SOURCE_PREFIXES.some(prefix => normalized.startsWith(prefix)) || !SOURCE_EXTENSION.test(normalized) || SELF_PATH.test(normalized)) fail('Only allowlisted application source paths may be supplied.');
  if (/(?:^|[/._-])(?:env|auth|secret|credential|policy|instructions?)(?:[/._-]|$)/i.test(normalized)) fail('Private settings, authentication, and policy files are not allowed.');
  return normalized;
}

async function rootDirectory(root) {
  const resolved = path.resolve(root);
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Workspace root must be a real directory, not a link.');
  return fs.realpath(resolved);
}

async function inspectPath(root, relative, { missingLeaf = false } = {}) {
  const segments = relative.split('/');
  let target = root;
  for (let index = 0; index < segments.length; index++) {
    target = path.join(target, segments[index]);
    let stat;
    try { stat = await fs.lstat(target); } catch (error) {
      if (error.code === 'ENOENT' && missingLeaf && index === segments.length - 1) return { target, missing: true };
      throw error;
    }
    if (stat.isSymbolicLink()) fail('Symbolic links and junctions are not allowed.');
    if (index < segments.length - 1 && !stat.isDirectory()) fail('A source path parent is not a directory.');
    if (index === segments.length - 1 && (!stat.isFile() || stat.nlink !== 1)) fail('Source paths must refer to regular files without hard links.');
    const real = await fs.realpath(target);
    if (!isInside(root, real)) fail('Source path leaves the workspace.');
  }
  return { target, missing: false };
}

function textFromBytes(bytes) {
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail('Source must be valid UTF-8 text.'); }
  if (content.includes('\0')) fail('Binary source content is not allowed.');
  return content;
}

function validateSnapshots(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length > COORDINATION_WORKSPACE_LIMITS.maxFiles) fail('At most eight explicit source files are allowed.');
  const seen = new Set(); let total = 0;
  return snapshots.map(item => {
    if (!plain(item)) fail('Invalid source snapshot.');
    const sourcePath = assertAllowedSourcePath(item.path);
    const key = sourcePath.toLowerCase();
    if (seen.has(key)) fail('Duplicate source paths are not allowed.');
    seen.add(key);
    if (item.content === null && item.sha256 === null) return { path: sourcePath, content: null, sha256: null };
    if (typeof item.content !== 'string' || item.content.includes('\0') || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || sha256(item.content) !== item.sha256) fail('Source snapshot hash is invalid.');
    const size = Buffer.byteLength(item.content);
    if (size > COORDINATION_WORKSPACE_LIMITS.maxFileBytes) fail('A source file exceeds the 64 KiB context limit.');
    total += size;
    if (total > COORDINATION_WORKSPACE_LIMITS.maxTotalBytes) fail('Source context exceeds the 160 KiB total limit.');
    return { path: sourcePath, content: item.content, sha256: item.sha256 };
  });
}

export async function captureSnapshots(root, paths) {
  if (!Array.isArray(paths) || paths.length > COORDINATION_WORKSPACE_LIMITS.maxFiles) fail('At most eight explicit source files are allowed.');
  const canonicalRoot = await rootDirectory(root);
  const snapshots = []; let total = 0; const seen = new Set();
  for (const supplied of paths) {
    const sourcePath = assertAllowedSourcePath(supplied);
    if (seen.has(sourcePath.toLowerCase())) fail('Duplicate source paths are not allowed.');
    seen.add(sourcePath.toLowerCase());
    const target = await inspectPath(canonicalRoot, sourcePath, { missingLeaf: true });
    if (target.missing) { snapshots.push({ path: sourcePath, content: null, sha256: null }); continue; }
    const handle = await fs.open(target.target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > COORDINATION_WORKSPACE_LIMITS.maxFileBytes) fail('A source file exceeds the 64 KiB context limit.');
      await inspectPath(canonicalRoot, sourcePath);
      const bytes = await handle.readFile();
      if (bytes.length > COORDINATION_WORKSPACE_LIMITS.maxFileBytes) fail('A source file exceeds the 64 KiB context limit.');
      total += bytes.length;
      if (total > COORDINATION_WORKSPACE_LIMITS.maxTotalBytes) fail('Source context exceeds the 160 KiB total limit.');
      const content = textFromBytes(bytes);
      snapshots.push({ path: sourcePath, content, sha256: sha256(content) });
    } finally { await handle.close(); }
  }
  return validateSnapshots(snapshots);
}

export function validateReplacementProposal(proposal, snapshots) {
  const files = validateSnapshots(snapshots);
  if (!plain(proposal) || typeof proposal.summary !== 'string' || !Array.isArray(proposal.changes) || proposal.changes.length > COORDINATION_WORKSPACE_LIMITS.maxChanges) fail('A proposal must contain a summary and at most five replacements.');
  const byPath = new Map(files.map(file => [file.path, file]));
  const seen = new Set(); let total = 0;
  const changes = proposal.changes.map(change => {
    if (!plain(change)) fail('Invalid replacement.');
    const sourcePath = assertAllowedSourcePath(change.path);
    const original = byPath.get(sourcePath);
    if (!original || change.path !== sourcePath || seen.has(sourcePath.toLowerCase())) fail('Every replacement must target one explicitly supplied snapshot path, exactly once.');
    seen.add(sourcePath.toLowerCase());
    if (change.baseHash !== original.sha256) fail('A replacement base hash does not match its source snapshot.');
    if (typeof change.content !== 'string' || change.content.includes('\0') || Buffer.from(change.content).toString('utf8') !== change.content) fail('Replacement content must be UTF-8 text.');
    total += Buffer.byteLength(change.content);
    if (total > COORDINATION_WORKSPACE_LIMITS.maxNewTextBytes) fail('Replacement text exceeds the 100 KiB total limit.');
    return { path: sourcePath, baseHash: original.sha256, content: change.content, sha256: sha256(change.content) };
  });
  return { summary: proposal.summary, changes };
}

function diffLines(content) { if (content === null || content === '') return []; const lines = content.split('\n'); if (lines.at(-1) === '') lines.pop(); return lines; }
function diffSide(content, prefix) { const lines = diffLines(content).map(line => prefix + line); if (content && !content.endsWith('\n')) lines.push('\\ No newline at end of file'); return lines; }
export function replacementDiff(snapshots, changes) {
  const originals = new Map(snapshots.map(file => [file.path, file]));
  return changes.filter(change => originals.get(change.path).content !== change.content).map(change => {
    const original = originals.get(change.path); const before = diffLines(original.content); const after = diffLines(change.content);
    return [`diff --git a/${change.path} b/${change.path}`, `--- ${original.content === null ? '/dev/null' : `a/${change.path}`}`, `+++ b/${change.path}`, `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@`, ...diffSide(original.content, '-'), ...diffSide(change.content, '+')].join('\n') + '\n';
  }).join('');
}

async function ensureDirectory(root, relative) {
  let current = root;
  for (const segment of relative.split('/').filter(Boolean)) {
    current = path.join(current, segment);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !isInside(root, await fs.realpath(current))) fail('Artifact directories must be real workspace directories.');
  }
  return current;
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function saveCoordinationRun(root, report, { snapshots, outputDir } = {}) {
  const canonicalRoot = await rootDirectory(root);
  const originals = validateSnapshots(snapshots);
  if (!plain(report)) fail('A coordination report is required.');
  const validated = report.proposal ? validateReplacementProposal(report.proposal, originals) : { summary: '', changes: [] };
  const base = path.join(canonicalRoot, 'backend', 'data', 'coordination');
  const requested = outputDir ? path.resolve(canonicalRoot, outputDir) : base;
  if (!isInside(base, requested)) fail('Artifacts must remain under backend/data/coordination.');
  const runId = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}`;
  const relative = path.relative(canonicalRoot, path.join(requested, runId)).split(path.sep).join('/');
  const runDir = await ensureDirectory(canonicalRoot, relative);
  const artifacts = {
    'plan.json': JSON.stringify(report.plan ?? null, null, 2) + '\n',
    'report.json': JSON.stringify(report, null, 2) + '\n',
    'changes.patch': replacementDiff(originals, validated.changes),
  };
  for (const [filename, content] of Object.entries(artifacts)) await fs.writeFile(path.join(runDir, filename), content, { flag: 'wx', mode: 0o600 });
  const manifest = { version: 1, runId, createdAt: new Date().toISOString(), status: report.status, reviewVerdict: report.review?.verdict ?? null, ownerApproved: false, changesApplied: false, checksExecuted: false, summary: validated.summary, snapshots: originals, changes: validated.changes, artifacts: Object.fromEntries(Object.entries(artifacts).map(([filename, content]) => [filename, sha256(content)])) };
  const manifestPath = path.join(runDir, 'patch-manifest.json');
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  await fs.writeFile(manifestPath, manifestText, { flag: 'wx', mode: 0o600 });
  return { runDir, manifestPath, manifestSha256: sha256(manifestText), patchPath: path.join(runDir, 'changes.patch') };
}

async function readArtifact(root, absolute) {
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (!isInside(root, absolute)) fail('Artifact leaves the workspace.');
  const inspected = await inspectPath(root, relative);
  const stat = await fs.stat(inspected.target);
  if (stat.size > 2 * 1024 * 1024) fail('Artifact exceeds the size limit.');
  return fs.readFile(inspected.target, 'utf8');
}

async function verifyCurrent(root, snapshot) {
  const location = await inspectPath(root, snapshot.path, { missingLeaf: true });
  if (snapshot.content === null) { if (!location.missing) fail(`New source path already exists: ${snapshot.path}`); return; }
  if (location.missing) fail(`Source disappeared: ${snapshot.path}`);
  const bytes = await fs.readFile(location.target);
  if (sha256(bytes) !== snapshot.sha256) fail(`Source changed since review: ${snapshot.path}`);
}

async function replaceSource(root, snapshot, content) {
  await verifyCurrent(root, snapshot);
  const location = await inspectPath(root, snapshot.path, { missingLeaf: true });
  const handle = await fs.open(location.target, snapshot.content === null ? 'wx' : constants.O_RDWR | (constants.O_NOFOLLOW || 0), 0o600);
  try {
    await inspectPath(root, snapshot.path);
    if (snapshot.content !== null) {
      const before = await handle.readFile();
      if (sha256(before) !== snapshot.sha256) fail(`Source changed before writing: ${snapshot.path}`);
    }
    const bytes = Buffer.from(content);
    for (let offset = 0; offset < bytes.length;) { const result = await handle.write(bytes, offset, bytes.length - offset, offset); if (!result.bytesWritten) fail('Source write made no progress.'); offset += result.bytesWritten; }
    await handle.truncate(bytes.length);
    await handle.sync();
  } finally { await handle.close(); }
}

async function restoreSource(root, snapshot) {
  const location = await inspectPath(root, snapshot.path, { missingLeaf: true });
  if (snapshot.content === null) { if (!location.missing) await fs.unlink(location.target); return; }
  const handle = await fs.open(location.target, constants.O_WRONLY | (constants.O_NOFOLLOW || 0));
  try { await inspectPath(root, snapshot.path); const bytes = Buffer.from(snapshot.content); for (let offset = 0; offset < bytes.length;) { const result = await handle.write(bytes, offset, bytes.length - offset, offset); if (!result.bytesWritten) fail('Source write made no progress.'); offset += result.bytesWritten; } await handle.truncate(bytes.length); await handle.sync(); }
  finally { await handle.close(); }
}

export async function applyCoordinationRun(root, manifestPath, approvedSha256, { beforeWrite } = {}) {
  if (typeof approvedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(approvedSha256)) fail('Explicit --approve <reviewed manifest SHA-256> is required.');
  const canonicalRoot = await rootDirectory(root);
  const absolute = path.resolve(canonicalRoot, manifestPath);
  const base = path.join(canonicalRoot, 'backend', 'data', 'coordination');
  if (!isInside(base, absolute) || path.basename(absolute) !== 'patch-manifest.json') fail('Apply requires a saved coordination patch manifest.');
  const manifestText = await readArtifact(canonicalRoot, absolute);
  if (sha256(manifestText) !== approvedSha256) fail('Manifest changed or its explicit approval hash is incorrect.');
  const manifest = JSON.parse(manifestText);
  if (!plain(manifest) || manifest.version !== 1 || manifest.status !== 'review_required' || manifest.reviewVerdict !== 'ready_for_review' || manifest.ownerApproved !== false || manifest.changesApplied !== false) fail('Only a reviewed, unapplied replacement proposal can be approved.');
  const originals = validateSnapshots(manifest.snapshots);
  const validated = validateReplacementProposal({ summary: manifest.summary, changes: manifest.changes }, originals);
  if (!validated.changes.length) fail('There are no proposed changes to apply.');
  if (!plain(manifest.artifacts) || Object.keys(manifest.artifacts).sort().join(',') !== 'changes.patch,plan.json,report.json') fail('Invalid artifact manifest.');
  const runDir = path.dirname(absolute);
  for (const filename of ['plan.json', 'report.json', 'changes.patch']) {
    const content = await readArtifact(canonicalRoot, path.join(runDir, filename));
    if (sha256(content) !== manifest.artifacts[filename]) fail('A reviewed artifact was modified.');
  }
  const expectedDiff = replacementDiff(originals, validated.changes);
  if (sha256(expectedDiff) !== manifest.artifacts['changes.patch']) fail('Patch does not match the reviewed replacements.');
  for (const change of validated.changes) if (manifest.changes.find(item => item.path === change.path).sha256 !== change.sha256) fail('Replacement hash is invalid.');
  const lockPath = path.join(runDir, 'apply.lock');
  const lock = await fs.open(lockPath, 'wx', 0o600);
  const journalPath = path.join(runDir, 'apply-journal.json');
  const journal = { version: 1, manifestSha256: approvedSha256, status: 'applying', startedAt: new Date().toISOString(), originals, attempted: [], applied: [], rollbackFailures: [], checksExecuted: false };
  let journalStarted = false;
  try {
    try { await fs.access(journalPath); fail('This run already has an apply journal; inspect it before retrying.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const snapshot of originals) await verifyCurrent(canonicalRoot, snapshot);
    await atomicJson(journalPath, journal); journalStarted = true;
    const byPath = new Map(originals.map(item => [item.path, item]));
    for (const [index, change] of validated.changes.entries()) {
      if (beforeWrite) await beforeWrite({ index, path: change.path });
      const snapshot = byPath.get(change.path);
      await verifyCurrent(canonicalRoot, snapshot);
      journal.attempted.push(change.path); await atomicJson(journalPath, journal);
      await replaceSource(canonicalRoot, snapshot, change.content);
      journal.applied.push(change.path); await atomicJson(journalPath, journal);
    }
    journal.status = 'applied'; journal.completedAt = new Date().toISOString(); await atomicJson(journalPath, journal);
    return { status: 'applied', applied: journal.applied, journalPath, checksExecuted: false };
  } catch (error) {
    if (journalStarted) {
      const byPath = new Map(originals.map(item => [item.path, item]));
      for (const sourcePath of [...journal.attempted].reverse()) {
        try { await restoreSource(canonicalRoot, byPath.get(sourcePath)); } catch (rollbackError) { journal.rollbackFailures.push({ path: sourcePath, message: rollbackError.message }); }
      }
      journal.status = journal.rollbackFailures.length ? 'rollback_failed' : 'rolled_back'; journal.error = error.message; journal.completedAt = new Date().toISOString();
      try { await atomicJson(journalPath, journal); } catch (journalError) { error.message += ` Journal update failed: ${journalError.message}`; }
      error.message += journal.rollbackFailures.length ? ' Rollback incomplete; inspect the journal.' : ' All attempted changes were rolled back.';
    }
    throw error;
  } finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
}



