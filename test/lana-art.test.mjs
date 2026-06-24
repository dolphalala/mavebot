import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanaHeartPng, loveLetters, randomLoveLetter } from '../src/lana-art.mjs';

test('createLanaHeartPng returns a real PNG image buffer', () => {
  const png = createLanaHeartPng({ width: 128, height: 96, variant: 1 });

  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 96);
  assert.equal(png.includes(Buffer.from('IDAT', 'ascii')), true);
  assert.equal(png.includes(Buffer.from('IEND', 'ascii')), true);
});

test('createLanaHeartPng rejects unusable image sizes', () => {
  assert.throws(
    () => createLanaHeartPng({ width: 32, height: 128 }),
    /dimensions/
  );
});

test('randomLoveLetter returns one of the configured Lana notes', () => {
  const letter = randomLoveLetter();

  assert.equal(loveLetters.includes(letter), true);
  assert.equal(typeof letter.title, 'string');
  assert.equal(typeof letter.body, 'string');
  assert.equal(typeof letter.note, 'string');
});
