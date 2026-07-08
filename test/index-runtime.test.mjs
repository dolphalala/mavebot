import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { commands } from '../src/commands.mjs';

test('registered slash commands have runtime command branches', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  for (const command of commands) {
    assert.match(
      source,
      new RegExp(`interaction\\.commandName === ['"]${command.name}['"]`),
      `${command.name} is registered but has no runtime handler branch`
    );
  }
});

test('loveu runtime sends a generated heart attachment and poem helper', async () => {
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

  assert.match(source, /randomLoveuPoem/);
  assert.match(source, /loveu-heart\.png/);
  assert.match(source, /createLanaHeartPng/);
  assert.match(source, /allowedMentions: \{ users: \[targetUser\.id\] \}/);
});
