import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCoordinationRun } from '../agent/coordination/workspace.mjs';

const HELP = `Apply an operator-reviewed Muse Pet coordination proposal.\n\nUsage: node backend/scripts/apply-coordination.mjs --artifact <patch-manifest.json> --approve <manifest-sha256>\n\nRead plan.json, report.json, changes.patch, and patch-manifest.json before approving.\nThe approval hash must identify the exact manifest reviewed by the operator.\nAll original source hashes and new-file absence are rechecked before any write.\nNo model calls, environment loading, generated commands, or verification commands run.\n`;

export async function runApplyCoordination({ args = [], root = fileURLToPath(new URL('../../', import.meta.url)), write = value => process.stdout.write(value), writeError = value => process.stderr.write(value) } = {}) {
  try {
    if (!args.length || args.includes('--help')) { write(HELP); return 0; }
    let artifact; let approval;
    for (let index = 0; index < args.length; index++) {
      const flag = args[index];
      if (!['--artifact', '--approve'].includes(flag) || index + 1 >= args.length || args[index + 1].startsWith('--')) throw new Error('Use --artifact <manifest> and --approve <manifest-sha256>.');
      if (flag === '--artifact') { if (artifact) throw new Error('Duplicate --artifact.'); artifact = args[++index]; }
      else { if (approval) throw new Error('Duplicate --approve.'); approval = args[++index]; }
    }
    if (!artifact || !approval) throw new Error('Both --artifact and explicit --approve are required.');
    const result = await applyCoordinationRun(root, artifact, approval);
    write(JSON.stringify(result, null, 2) + '\n'); return 0;
  } catch (error) { writeError(`Apply stopped: ${error.message}\n`); return 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runApplyCoordination({ args: process.argv.slice(2) });
