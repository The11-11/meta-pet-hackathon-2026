import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Read-only validator: never creates, synthesizes, rewrites, or downloads audio.
async function validate(name) {
  const bytes = await readFile(new URL(`../assets/sounds/${name}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  let format; let data;
  for (let position = 12; position + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', position, position + 4);
    const length = bytes.readUInt32LE(position + 4);
    assert.ok(position + 8 + length <= bytes.length, 'WAV chunk must fit the file');
    if (kind === 'fmt ') format = bytes.subarray(position + 8, position + 8 + length);
    if (kind === 'data') data = bytes.subarray(position + 8, position + 8 + length);
    position += 8 + length + length % 2;
  }
  assert.ok(format?.length >= 16 && data?.length > 0, 'PCM format and audio data are required');
  assert.equal(format.readUInt16LE(0), 1, 'uncompressed PCM');
  assert.equal(format.readUInt16LE(2), 1, 'mono');
  assert.equal(format.readUInt32LE(4), 22_050);
  assert.equal(format.readUInt32LE(8), 44_100);
  assert.equal(format.readUInt16LE(12), 2);
  assert.equal(format.readUInt16LE(14), 16);
  assert.equal(data.length % 2, 0);
  const count = data.length / 2;
  const seconds = count / 22_050;
  assert.ok(seconds > 0.05 && seconds < 2, 'notification sounds must be short');
  let peak = 0; let sum = 0; let squares = 0;
  for (let index = 0; index < count; index++) {
    const pcm = data.readInt16LE(index * 2);
    assert.ok(pcm > -32_768 && pcm < 32_767, 'no clipped samples');
    const sample = pcm / 32_768;
    peak = Math.max(peak, Math.abs(sample)); sum += sample; squares += sample * sample;
  }
  const mean = sum / count;
  const rms = Math.sqrt(squares / count);
  assert.ok(peak > 0.1 && peak <= 0.75, 'audible with moderate peak level');
  assert.ok(rms > 0.01, 'audio must not be blank');
  assert.ok(Math.abs(mean) < 0.0001, 'negligible DC offset');
  assert.equal(data.readInt16LE(0), 0, 'silent start');
  assert.equal(data.readInt16LE(data.length - 2), 0, 'silent end');
  return { name, format: 'PCM16 mono', sampleRate: 22_050, seconds, bytes: bytes.length,
    peak: Number(peak.toFixed(6)), mean: Number(mean.toFixed(9)), rms: Number(rms.toFixed(6)) };
}

console.log(JSON.stringify({ validationOnly: true, sounds: await Promise.all(['bark.wav', 'meow_v2.wav'].map(validate)) }, null, 2));
