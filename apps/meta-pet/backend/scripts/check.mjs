import { checkProvider } from '../src/muse.mjs';

try {
  const result = await checkProvider({ apiKey: process.env.MODEL_API_KEY?.trim(), model: process.env.MODEL_NAME?.trim() || 'muse-spark-1.3' });
  console.log(result.message);
  if (result.verified) console.log(`Verified model: ${result.model}`);
  else process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
