import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  buildCodexWorkerPrompt,
  checkUrl,
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

test('checkUrl supports the Slack bridge health port', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(4190, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error?.code === 'EADDRINUSE') {
      t.skip('port 4190 is already in use on this machine');
      return;
    }
    throw error;
  }

  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  assert.equal(await checkUrl('http://127.0.0.1:4190/healthz'), true);
});
