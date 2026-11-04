import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, relative, resolve } from 'node:path';
import { coordinateDevelopment, COORDINATION_LIMITS } from '../agent/coordination/coordinator.mjs';
import { captureSnapshots, saveCoordinationRun } from '../agent/coordination/workspace.mjs';

export const COORDINATION_USAGE = 'Muse development coordinator\n\nPlan: npm run team:coordinate -- --request "Describe the requested improvement" --file src/example.ts\nPatch: npm run team:coordinate -- --mode patch --request "Describe the feature" --file src/example.ts --file src/new-feature.ts\nPreview inputs without Meta: add --dry-run\nOptions: --request <1..4000 characters>, repeatable --file <explicit relative source path>, --mode plan|patch (default plan), --output-dir <folder under backend/data/coordination>, --dry-run, --help\n\nCoordination makes bounded real Meta requests and writes ignored local review artifacts. It never applies changes, runs commands, deploys or exposes development tools to pet chat. A separate explicit apply command requires the exact reviewed artifact hash.';
const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));

export function parseCoordinationArgs(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('Invalid coordinator arguments.');
  if (!args.length || args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const parsed = { mode: 'plan', files: [], dryRun: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--dry-run') { if (parsed.dryRun) throw new Error('Supply --dry-run only once.'); parsed.dryRun = true; continue; }
    if (!['--request', '--file', '--mode', '--output-dir'].includes(option) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(COORDINATION_USAGE);
    if (option !== '--file' && seen.has(option)) throw new Error('Supply each coordinator option only once, except --file.');
    seen.add(option); const value = args[++i];
    if (option === '--file') parsed.files.push(value);
    else if (option === '--request') parsed.request = value;
    else if (option === '--mode') parsed.mode = value;
    else parsed.outputDir = value;
  }
  if (typeof parsed.request !== 'string' || !parsed.request.trim() || parsed.request.length > 4000) throw new Error('Supply --request with 1 to 4000 characters.');
  if (!['plan', 'patch'].includes(parsed.mode)) throw new Error('Choose --mode plan or patch.');
  if (parsed.files.length > COORDINATION_LIMITS.maxFiles || new Set(parsed.files).size !== parsed.files.length) throw new Error('Supply at most eight unique explicit --file paths.');
  if (parsed.mode === 'patch' && !parsed.files.length) throw new Error('Patch mode requires explicit --file paths.');
  return parsed;
}
function outputDirectory(root, configured) {
  const base = resolve(root, 'backend/data/coordination');
  if (configured === undefined) return base;
  const target = resolve(root, configured); const inside = relative(base, target);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Coordination artifacts must remain under backend/data/coordination.');
  return target;
}

export async function runCoordination({ args = [], root = defaultRoot, env, fetchImpl = fetch, write = value => console.log(value), writeProgress = value => console.error(JSON.stringify(value)) } = {}) {
  const parsed = parseCoordinationArgs(args);
  if (parsed.help) { write(COORDINATION_USAGE); return 0; }
  const outputDir = outputDirectory(root, parsed.outputDir);
  const snapshots = await captureSnapshots(root, parsed.files);
  if (parsed.dryRun) {
    write(JSON.stringify({ mode: parsed.mode, status: 'dry_run', files: snapshots.map(({ path, content, sha256 }) => ({ path, sha256, newFile: content === null, bytes: content === null ? 0 : Buffer.byteLength(content, 'utf8') })), outputDir, maxModelCalls: COORDINATION_LIMITS.maxCalls, providerContacted: false, changesApplied: false, checksExecuted: false }, null, 2));
    return 0;
  }
  const settings = env ?? process.env;
  const apiKey = settings.MODEL_API_KEY?.trim();
  if (!apiKey) throw new Error('Add the existing Meta model key privately to backend/.env before running development coordination.');
  const report = await coordinateDevelopment({ request: parsed.request, mode: parsed.mode, files: snapshots, apiKey, model: settings.MODEL_NAME?.trim() || 'muse-spark-1.3', fetchImpl, onProgress: writeProgress });
  const artifact = await saveCoordinationRun(root, report, { snapshots, outputDir });
  write(JSON.stringify({ status: report.status, mode: report.mode, modelCalls: report.modelCalls, stages: report.receipts, artifact, proposedFiles: report.proposal?.changes.map(({ path }) => path) ?? [], changesApplied: false, checksExecuted: false, ...(report.error ? { error: report.error } : {}) }, null, 2));
  return report.status === 'failed' ? 1 : report.status === 'changes_requested' ? 2 : 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = await runCoordination({ args: process.argv.slice(2) }); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Muse development coordination failed.'); process.exitCode = 1; }
}

