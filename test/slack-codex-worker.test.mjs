import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodexWorkerPrompt,
  compactTranscriptRows
} from '../src/slack-codex-worker.mjs';

test('compactTranscriptRows keeps recent turns bounded and older turns summarized', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    at: `2026-06-24T00:00:0${index}.000Z`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    user: index % 2 === 0 ? `U${index}` : 'mavebot',
    text: `turn ${index}`
  }));

  const snapshot = compactTranscriptRows(rows, {
    recentLimit: 2,
    summaryLimit: 3,
    generatedAt: '2026-06-24T00:01:00.000Z'
  });

  assert.match(snapshot.summary, /Compacted Older Turns/);
  assert.match(snapshot.summary, /turn 1/);
  assert.match(snapshot.summary, /turn 3/);
  assert.doesNotMatch(snapshot.summary, /turn 0/);
  assert.match(snapshot.recent, /turn 4/);
  assert.match(snapshot.recent, /turn 5/);
  assert.doesNotMatch(snapshot.recent, /turn 3/);
  assert.match(snapshot.session, /Recent turn count included in prompts: 2/);
});

test('buildCodexWorkerPrompt puts active Slack request before memory', () => {
  const prompt = buildCodexWorkerPrompt({
    job: {
      user: 'UACTIVE',
      channel: 'CBOT',
      ts: '1782400000.000000',
      text: 'change /lana now'
    },
    summary: 'old request: change /player',
    recent: 'recent request: check /ping',
    operatingMemory: 'operating memory',
    slackSession: 'slack session',
    slackMemoryTail: 'raw memory'
  });

  assert.ok(
    prompt.indexOf('Active Slack request') < prompt.indexOf('# Worker Compacted Memory'),
    'active Slack request should be before compacted memory'
  );
  assert.ok(
    prompt.indexOf('change /lana now') < prompt.indexOf('old request: change /player'),
    'active request text should come before older memory'
  );
  assert.match(prompt, /Do not commit or push/);
  assert.match(prompt, /Discord command changes must update both src\/commands\.mjs and src\/index\.mjs/);
});
