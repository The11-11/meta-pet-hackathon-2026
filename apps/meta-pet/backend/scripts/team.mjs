import { existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildDevelopmentRequest, getSpecialist, listSpecialists } from '../agent/team/index.mjs';

const ENDPOINT = 'https://api.meta.ai/v1/responses';
const usage = 'List all roles: team:list\nConsult a development role: team:consult -- --specialist <id> --message "Your explicit project context and question"\nConsultation sends only that message and authored instructions to Meta; it cannot read the repository or run tools.';

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--list') return { list: true };
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--specialist', '--message'].includes(key) || values[key] !== undefined || typeof args[i + 1] !== 'string') throw new Error(usage);
    values[key] = args[i + 1];
  }
  if (!values['--specialist'] || !values['--message']) throw new Error(usage);
  return { id: values['--specialist'], message: values['--message'] };
}

export async function runTeam({ args = [], env, fetchImpl = fetch, write = value => console.log(value) } = {}) {
  const parsed = parseArgs(args);
  // This path never reads environment values or calls a provider.
  if (parsed.list) { write(JSON.stringify({ execution: 'instruction_routing', roles: listSpecialists() }, null, 2)); return 0; }
  if (parsed.help) { write(usage); return 0; }
  const role = getSpecialist(parsed.id, 'development');
  // Validate the message before reading credentials or making a request.
  buildDevelopmentRequest(role.id, parsed.message);
  const settings = env ?? process.env;
  const apiKey = settings.MODEL_API_KEY?.trim();
  if (!apiKey) throw new Error('Add the existing Meta model key privately to backend/.env before consulting the local development team.');
  const request = buildDevelopmentRequest(role.id, parsed.message, settings.MODEL_NAME?.trim() || 'muse-spark-1.3');
  let response;
  try {
    response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(25_000) });
  } catch { throw new Error('The development specialist could not reach Meta. Please try again.'); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'The Meta model key needs attention on the server.' : 'The development specialist could not complete this request.');
  let data;
  try { data = await response.json(); } catch { throw new Error('The development specialist returned an unreadable response.'); }
  const output = Array.isArray(data.output) ? data.output : [];
  if (data.error || data.incomplete_details || (data.status !== undefined && data.status !== 'completed') || output.some(item => item.status !== undefined && item.status !== 'completed')) throw new Error('The development specialist did not finish its response. Please try again.');
  if (output.some(item => item.type === 'function_call')) throw new Error('The specialist returned an unsupported action. No action ran.');
  const reply = output.filter(item => item.type === 'message').flatMap(item => Array.isArray(item.content) ? item.content : []).filter(part => part.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
  if (!reply) throw new Error('The development specialist did not return advice. Please try again.');
  write(JSON.stringify({ specialist: { id: role.id, label: role.label, execution: 'instruction_routing' }, mode: 'live', advice: reply, toolsExecuted: false }, null, 2));
  return 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = await runTeam({ args: process.argv.slice(2) }); }
  catch (error) { console.error(error instanceof Error ? error.message : 'The development consultation failed.'); process.exitCode = 1; }
}
