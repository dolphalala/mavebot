import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLanaHeartPng,
  loveLetters,
  loveuPoems,
  randomLoveLetter,
  randomLoveuPoem
} from '../src/lana-art.mjs';

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

test('heart variants produce different image bytes', () => {
  const first = createLanaHeartPng({ width: 128, height: 128, variant: 101 });
  const second = createLanaHeartPng({ width: 128, height: 128, variant: 202 });

  assert.notDeepEqual(first, second);
});

test('randomLoveLetter returns one of the configured Lana notes', () => {
  const letter = randomLoveLetter();

  assert.equal(loveLetters.includes(letter), true);
  assert.equal(typeof letter.title, 'string');
  assert.equal(typeof letter.body, 'string');
  assert.equal(typeof letter.note, 'string');
});

test('randomLoveuPoem writes a poem for the selected target', () => {
  const poem = randomLoveuPoem('Dolphala');

  assert.equal(loveuPoems.titles.includes(poem.title), true);
  assert.match(poem.body, /Dolphala/);
  assert.equal(poem.body.split('\n').length, 4);
  assert.equal(loveuPoems.notes.includes(poem.note), true);
  assert.equal(typeof poem.note, 'string');
});

test('randomLoveuPoem avoids repeating the exact same poem back to back', () => {
  const first = randomLoveuPoem('Dolphala', { random: () => 0 });
  const second = randomLoveuPoem('Dolphala', { random: () => 0 });

  assert.notDeepEqual(second, first);
  assert.match(second.body, /Dolphala/);
});
