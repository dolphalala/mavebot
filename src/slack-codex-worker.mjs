import 'dotenv/config';
import { spawn } from 'node:child_process';
import {
  access,
  appendFile,
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoUrl =
  process.env.SLACK_WORKER_REPOSITORY_URL ||
  process.env.SLACK_CODEX_REPOSITORY_URL ||
  'https://github.com/dolphalala/mavebot.git';
const branch = process.env.SLACK_WORKER_BRANCH || 'main';
const sharedDir = process.env.SLACK_WORKER_SHARED_DIR || '/shared/codex-worker';
const jobDir = process.env.SLACK_WORKER_JOB_DIR || path.join(sharedDir, 'jobs');
const processingDir =
  process.env.SLACK_WORKER_PROCESSING_DIR || path.join(sharedDir, 'processing');
const doneDir = process.env.SLACK_WORKER_DONE_DIR || path.join(sharedDir, 'done');
const failedDir = process.env.SLACK_WORKER_FAILED_DIR || path.join(sharedDir, 'failed');
const contextDir =
  process.env.SLACK_WORKER_CONTEXT_DIR || path.join(sharedDir, 'context');
const repoDir = process.env.SLACK_WORKER_REPO_DIR || path.join(sharedDir, 'repo');
const liveAppDir = process.env.SLACK_WORKER_LIVE_APP_DIR || '/live-app';
const slackMemoryPath =
  process.env.SLACK_MEMORY_PATH || '/shared/slack-memory.jsonl';
const slackBotToken = process.env.SLACK_BOT_TOKEN || '';
const slackChannelId = process.env.SLACK_CHANNEL_ID || '';
const workerName = process.env.SLACK_WORKER_NAME || 'mavebot';
const codexBin = process.env.CODEX_BIN || 'codex';
const codexModel = process.env.CODEX_MODEL || process.env.SLACK_WORKER_CODEX_MODEL || '';
const gitAuthorName = process.env.SLACK_WORKER_GIT_AUTHOR_NAME || 'mavebot worker';
const gitAuthorEmail =
  process.env.SLACK_WORKER_GIT_AUTHOR_EMAIL || 'mavebot-worker@users.noreply.github.com';
const botHealthUrl =
  process.env.SLACK_WORKER_BOT_HEALTH_URL || 'http://discord-bot:4188/healthz';
const bridgeHealthUrl =
  process.env.SLACK_WORKER_BRIDGE_HEALTH_URL || 'http://slack-bridge:4190/healthz';

const pollIntervalMs = parsePositiveInt(process.env.SLACK_WORKER_POLL_INTERVAL_MS, 3000);
const processingStaleMs = parsePositiveInt(
  process.env.SLACK_WORKER_PROCESSING_STALE_MS,
  15 * 60 * 1000
);
const jobTimeoutMs = parsePositiveInt(
  process.env.SLACK_WORKER_CODEX_TIMEOUT_MS,
  20 * 60 * 1000
);
const commandTimeoutMs = parsePositiveInt(
  process.env.SLACK_WORKER_COMMAND_TIMEOUT_MS,
  5 * 60 * 1000
);
const deployTimeoutMs = parsePositiveInt(
  process.env.SLACK_WORKER_DEPLOY_TIMEOUT_MS,
  5 * 60 * 1000
);
const fetchTimeoutMs = parsePositiveInt(
  process.env.SLACK_WORKER_FETCH_TIMEOUT_MS,
  15000
);
const recentTurnLimit = parsePositiveInt(process.env.SLACK_WORKER_RECENT_TURNS, 40);
const summaryTurnLimit = parsePositiveInt(process.env.SLACK_WORKER_SUMMARY_TURNS, 120);
const maxOutputChars = parsePositiveInt(process.env.SLACK_WORKER_MAX_OUTPUT_CHARS, 20000);

const transcriptPath = path.join(contextDir, 'transcript.jsonl');
const summaryPath = path.join(contextDir, 'summary.md');
const recentPath = path.join(contextDir, 'recent.md');
const sessionPath = path.join(contextDir, 'session.md');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, limit = 2000) {
  const text = String(value || '').trim();
  if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}...`;
}

function stripSlackLinks(text) {
  return String(text || '')
    .replace(/<https:\/\/chatgpt\.com\/(?:codex|s)\/[^>|]+(?:\|[^>]+)?>/g, '')
    .replace(/\bChatGPT helps you get answers, find inspiration, and be more productive\.\b/gi, '')
    .replace(/\bView task\b/gi, '')
    .replace(/^Codex:\s*/gim, '')
    .trim();
}

function redact(value) {
  let text = String(value || '');
  const secrets = [
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
    process.env.SLACK_BOT_TOKEN,
    process.env.SLACK_APP_TOKEN,
    process.env.SLACK_SIGNING_SECRET,
    process.env.DISCORD_TOKEN,
    process.env.COC_API_TOKEN
  ].filter((secret) => secret && secret.length > 8);

  for (const secret of secrets) {
    text = text.replaceAll(secret, '[redacted]');
  }

  const header = githubAuthHeader();
  if (header) {
    text = text.replaceAll(header, '[redacted-github-auth]');
  }

  return text;
}

function appendLimited(current, chunk) {
  const next = `${current}${chunk}`;
  if (next.length <= maxOutputChars) {
    return next;
  }
  return next.slice(-maxOutputChars);
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writePrivateText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => {});
}

async function appendPrivateJsonl(filePath, row) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(row)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await chmod(filePath, 0o600).catch(() => {});
}

function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    env = {},
    input,
    timeoutMs = commandTimeoutMs,
    allowFailure = false
  } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = {
        command,
        args,
        code,
        stdout: redact(stdout),
        stderr: redact(stderr),
        timedOut
      };
      if (!allowFailure && code !== 0) {
        const safeArgs = args.map((arg) => redact(arg)).join(' ');
        const error = new Error(
          `${command} ${safeArgs} exited ${code}${timedOut ? ' after timeout' : ''}\n${result.stderr || result.stdout}`
        );
        error.result = result;
        reject(error);
        return;
      }
      resolve(result);
    });

    if (input) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = fetchTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function postSlackMessage(text) {
  if (!slackBotToken || !slackChannelId) {
    console.log('Slack post skipped: missing bot token or channel id.');
    console.log(redact(text));
    return null;
  }

  const response = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${slackBotToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      channel: slackChannelId,
      text,
      unfurl_links: false,
      unfurl_media: false
    })
  });
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`chat.postMessage failed: ${result.error || 'unknown error'}`);
  }
  return result;
}

function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

function githubAuthHeader() {
  const token = githubToken();
  if (!token) {
    return '';
  }
  return Buffer.from(`x-access-token:${token}`).toString('base64');
}

function gitAuthArgs() {
  const header = githubAuthHeader();
  if (!header) {
    return [];
  }
  return [
    '-c',
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${header}`
  ];
}

async function git(args, options = {}) {
  return runProcess('git', [...gitAuthArgs(), ...args], {
    cwd: options.cwd || repoDir,
    timeoutMs: options.timeoutMs || commandTimeoutMs,
    allowFailure: options.allowFailure || false
  });
}

async function ensureDirectories() {
  await Promise.all([
    mkdir(jobDir, { recursive: true }),
    mkdir(processingDir, { recursive: true }),
    mkdir(doneDir, { recursive: true }),
    mkdir(failedDir, { recursive: true }),
    mkdir(contextDir, { recursive: true }),
    mkdir(path.dirname(repoDir), { recursive: true })
  ]);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function listJsonFiles(dir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

async function recycleStaleProcessingJobs() {
  const names = await listJsonFiles(processingDir);
  const now = Date.now();
  for (const name of names) {
    const source = path.join(processingDir, name);
    const info = await stat(source).catch(() => null);
    if (!info || now - info.mtimeMs < processingStaleMs) {
      continue;
    }
    const target = path.join(jobDir, name);
    await rename(source, target).catch(() => {});
  }
}

async function claimNextJob() {
  await recycleStaleProcessingJobs();
  const names = await listJsonFiles(jobDir);
  for (const name of names) {
    const source = path.join(jobDir, name);
    const target = path.join(processingDir, name);
    try {
      await rename(source, target);
      const job = await readJsonFile(target);
      return { job, path: target };
    } catch {
      continue;
    }
  }
  return null;
}

async function moveJob(jobPath, targetDir, job, extra = {}) {
  const target = path.join(targetDir, `${job.id || path.basename(jobPath, '.json')}.json`);
  const current = await readJsonFile(jobPath).catch(() => job);
  await writePrivateText(
    jobPath,
    `${JSON.stringify({ ...current, ...extra }, null, 2)}\n`
  );
  await rename(jobPath, target).catch(async () => {
    await writePrivateText(target, `${JSON.stringify({ ...current, ...extra }, null, 2)}\n`);
    await unlink(jobPath).catch(() => {});
  });
}

export function compactTranscriptRows(rows, options = {}) {
  const recentLimit = options.recentLimit ?? recentTurnLimit;
  const summaryLimit = options.summaryLimit ?? summaryTurnLimit;
  const recentRows = rows.slice(-recentLimit);
  const olderRows = rows.slice(0, Math.max(0, rows.length - recentLimit)).slice(-summaryLimit);
  const generatedAt = options.generatedAt || new Date().toISOString();

  const formatRow = (row, limit = 320) => {
    const speaker = row.role === 'assistant' ? workerName : row.user || row.role || 'unknown';
    return `- ${row.at || row.createdAt || 'unknown'} ${speaker}: ${truncate(row.text, limit).replace(/\n+/g, ' / ')}`;
  };

  const summary = [
    '# Mavebot Slack Context Summary',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This is compacted memory for the #bot Slack session. The active Slack job always has priority over this file.',
    '',
    '## Stable Operating Facts',
    '',
    '- Repo: dolphalala/mavebot.',
    '- Server app path: /opt/urba-apps/discord-bot/app.',
    '- Production deploy follows GitHub origin/main through the server poll deploy timer.',
    '- Slack #bot should behave like one channel session, with mavebot posting normal channel replies.',
    '- Do not touch Chatwoot, Bookkeeper, nginx, Docker daemon settings, or unrelated apps unless Allen asks for that exact action.',
    '',
    '## Compacted Older Turns',
    '',
    ...(olderRows.length ? olderRows.map((row) => formatRow(row)) : ['- No older turns yet.']),
    ''
  ].join('\n');

  const recent = [
    '# Mavebot Slack Recent Turns',
    '',
    `Generated: ${generatedAt}`,
    '',
    ...(recentRows.length ? recentRows.map((row) => formatRow(row, 1200)) : ['- No recent turns yet.']),
    ''
  ].join('\n');

  const session = [
    '# Mavebot Durable Session Memory',
    '',
    `Generated: ${generatedAt}`,
    '',
    'Use this file as the worker-side running memory for Slack jobs. The append-only source is transcript.jsonl, while summary.md and recent.md keep prompts bounded.',
    '',
    '## Current Session Shape',
    '',
    '- Slack #bot is the user-facing control surface.',
    '- Worker jobs should read repo docs/context/operating-memory.md and docs/context/slack-session.md before acting.',
    '- Code changes should be tested, committed, pushed to main, then verified on the server.',
    '',
    '## Recent Turns Pointer',
    '',
    `- Recent turn count included in prompts: ${recentRows.length}.`,
    `- Older compacted turn count included in prompts: ${olderRows.length}.`,
    ''
  ].join('\n');

  return { summary, recent, session };
}

async function readTranscriptRows() {
  try {
    const content = await readFile(transcriptPath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function rebuildContextFiles() {
  const rows = await readTranscriptRows();
  const snapshot = compactTranscriptRows(rows);
  await writePrivateText(summaryPath, snapshot.summary);
  await writePrivateText(recentPath, snapshot.recent);
  await writePrivateText(sessionPath, snapshot.session);
  return snapshot;
}

async function appendTurn(row) {
  await appendPrivateJsonl(transcriptPath, row);
  return rebuildContextFiles();
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readSlackMemoryTail(limit = 20) {
  try {
    const content = await readFile(slackMemoryPath, 'utf8');
    return content.split('\n').filter(Boolean).slice(-limit).join('\n');
  } catch {
    return '';
  }
}

function promptHeader(job) {
  return [
    'You are the server-side mavebot Codex runner.',
    '',
    'Active Slack request. This is the only task for this run:',
    JSON.stringify({
      user: job.user || 'unknown',
      channel: job.channel || slackChannelId,
      ts: job.ts || '',
      text: job.text || ''
    }, null, 2),
    '',
    'Hard rules:',
    '- Work in the current repository checkout only.',
    '- Do not use @Codex, official Codex Slack, Slack OAuth forwarding, or ChatGPT task links.',
    '- Do not commit or push. The worker will run checks, commit, push main, and verify deploy after you finish.',
    '- If the request is conversational and needs no code, answer normally.',
    '- If the request changes durable behavior or project facts, update docs/context/slack-session.md.',
    '- Before code changes, read docs/context/operating-memory.md and docs/context/slack-session.md.',
    '- Discord command changes must update both src/commands.mjs and src/index.mjs.',
    '- Keep mavebot isolated from Chatwoot, Bookkeeper, nginx, and unrelated apps.',
    '- Final answer should be concise and suitable to post directly in Slack as mavebot.',
    ''
  ].join('\n');
}

export function buildCodexWorkerPrompt({
  job,
  summary = '',
  recent = '',
  operatingMemory = '',
  slackSession = '',
  slackMemoryTail = ''
}) {
  return [
    promptHeader(job),
    '# Worker Compacted Memory',
    summary || 'No compacted memory yet.',
    '',
    '# Worker Recent Memory',
    recent || 'No recent memory yet.',
    '',
    '# Repo Operating Memory',
    operatingMemory || 'docs/context/operating-memory.md was not readable.',
    '',
    '# Repo Slack Session Memory',
    slackSession || 'docs/context/slack-session.md was not readable.',
    '',
    '# Raw Slack Memory Tail',
    slackMemoryTail || 'No raw Slack memory tail available.',
    ''
  ].join('\n');
}

async function ensureRepo() {
  const gitDir = path.join(repoDir, '.git');
  if (!(await pathExists(gitDir))) {
    await mkdir(path.dirname(repoDir), { recursive: true });
    await git(['clone', repoUrl, repoDir], { cwd: path.dirname(repoDir), timeoutMs: 10 * 60 * 1000 });
  }

  await git(['remote', 'set-url', 'origin', repoUrl], { allowFailure: true });
  await git(['fetch', 'origin', branch], { timeoutMs: 10 * 60 * 1000 });
  await git(['checkout', branch]);
  await git(['reset', '--hard', `origin/${branch}`]);
  await git(['clean', '-fd', '--', ':!node_modules']);
  await git(['config', 'user.name', gitAuthorName]);
  await git(['config', 'user.email', gitAuthorEmail]);
}

async function installDependencies() {
  await runProcess('npm', ['install', '--no-package-lock'], {
    cwd: repoDir,
    timeoutMs: 10 * 60 * 1000
  });
}

async function runChecks() {
  await runProcess('npm', ['run', 'check'], {
    cwd: repoDir,
    timeoutMs: 10 * 60 * 1000
  });
}

function commitSubject(text) {
  const normalized = String(text || 'Slack request')
    .replace(/<@[^>]+>/g, '')
    .replace(/[^A-Za-z0-9 /._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(normalized || 'Slack request', 70);
}

async function gitStdout(args, options = {}) {
  const result = await git(args, options);
  return result.stdout.trim();
}

async function gitHasChanges() {
  const status = await gitStdout(['status', '--porcelain']);
  return status.length > 0;
}

async function aheadCount() {
  const count = await gitStdout(['rev-list', '--count', `origin/${branch}..HEAD`], {
    allowFailure: true
  });
  return Number.parseInt(count || '0', 10) || 0;
}

async function commitAndPush(job) {
  if (await gitHasChanges()) {
    await git(['add', '-A']);
    await git(['commit', '-m', `Slack: ${commitSubject(job.text)}`]);
  }

  const ahead = await aheadCount();
  if (ahead <= 0) {
    return { pushed: false, commit: await gitStdout(['rev-parse', '--short', 'HEAD']) };
  }

  const fullCommit = await gitStdout(['rev-parse', 'HEAD']);
  await git(['push', 'origin', `HEAD:${branch}`], { timeoutMs: 10 * 60 * 1000 });
  return {
    pushed: true,
    commit: fullCommit.slice(0, 12),
    fullCommit
  };
}

async function waitForLiveCommit(fullCommit) {
  if (!fullCommit || !(await pathExists(path.join(liveAppDir, '.git')))) {
    return { matched: false, reason: 'live app checkout not mounted' };
  }

  const deadline = Date.now() + deployTimeoutMs;
  let lastSeen = '';
  while (Date.now() < deadline) {
    const result = await runProcess('git', ['-C', liveAppDir, 'rev-parse', 'HEAD'], {
      allowFailure: true,
      timeoutMs: 10000
    });
    lastSeen = result.stdout.trim();
    if (lastSeen === fullCommit) {
      return { matched: true, commit: lastSeen.slice(0, 12) };
    }
    await sleep(5000);
  }

  return {
    matched: false,
    reason: `live app stayed at ${lastSeen ? lastSeen.slice(0, 12) : 'unknown'}`
  };
}

async function checkUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const response = await fetchWithTimeout(url, {}, 10000);
    return response.ok;
  } catch {
    return false;
  }
}

async function verifyRuntime() {
  const [botOk, bridgeOk] = await Promise.all([
    checkUrl(botHealthUrl),
    checkUrl(bridgeHealthUrl)
  ]);
  return { botOk, bridgeOk };
}

async function runCodex(job, contextSnapshot) {
  const operatingMemory = await readOptional(path.join(repoDir, 'docs/context/operating-memory.md'));
  const slackSession = await readOptional(path.join(repoDir, 'docs/context/slack-session.md'));
  const slackMemoryTail = await readSlackMemoryTail();
  const prompt = buildCodexWorkerPrompt({
    job,
    summary: contextSnapshot.summary,
    recent: contextSnapshot.recent,
    operatingMemory,
    slackSession,
    slackMemoryTail
  });
  const outputPath = path.join(contextDir, 'last-codex-message.md');
  const args = [
    'exec',
    '--cd',
    repoDir,
    '--sandbox',
    'danger-full-access',
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-last-message',
    outputPath
  ];
  if (codexModel) {
    args.push('--model', codexModel);
  }
  args.push('-');

  await runProcess(codexBin, args, {
    cwd: repoDir,
    input: prompt,
    timeoutMs: jobTimeoutMs
  });

  return stripSlackLinks(await readOptional(outputPath));
}

function finalSlackMessage({ codexMessage, checkOk, pushResult, deployResult, runtime }) {
  const lines = [];
  const cleaned = stripSlackLinks(codexMessage);
  if (cleaned) {
    lines.push(cleaned);
    lines.push('');
  }

  if (pushResult.pushed) {
    lines.push(`Pushed to main: ${pushResult.commit}.`);
  } else {
    lines.push('No repo changes were needed.');
  }

  lines.push(checkOk ? 'Checks passed.' : 'Checks did not complete.');
  if (pushResult.pushed) {
    lines.push(
      deployResult.matched
        ? `Server deploy picked it up: ${deployResult.commit}.`
        : `Server deploy not confirmed yet: ${deployResult.reason}.`
    );
  }
  lines.push(
    `Runtime health: Discord ${runtime.botOk ? 'ok' : 'not ok'}, Slack bridge ${runtime.bridgeOk ? 'ok' : 'not ok'}.`
  );

  return truncate(lines.join('\n'), 3500);
}

async function handleJob(claimed) {
  const { job, path: jobPath } = claimed;
  console.log(`Processing Slack job ${job.id}: ${truncate(job.text, 120)}`);

  let contextSnapshot = await appendTurn({
    at: new Date().toISOString(),
    role: 'user',
    user: job.user || 'unknown',
    jobId: job.id,
    text: job.text || ''
  });

  try {
    await ensureRepo();
    await installDependencies();
    const codexMessage = await runCodex(job, contextSnapshot);
    await installDependencies();
    await runChecks();
    const pushResult = await commitAndPush(job);
    const deployResult = pushResult.pushed
      ? await waitForLiveCommit(pushResult.fullCommit)
      : { matched: false, reason: 'no push needed' };
    const runtime = await verifyRuntime();
    const slackText = finalSlackMessage({
      codexMessage,
      checkOk: true,
      pushResult,
      deployResult,
      runtime
    });

    await appendTurn({
      at: new Date().toISOString(),
      role: 'assistant',
      user: workerName,
      jobId: job.id,
      text: slackText
    });
    let slackPostError = '';
    try {
      await postSlackMessage(slackText);
    } catch (postError) {
      slackPostError = truncate(redact(postError.message || postError), 1000);
      console.error(`Final Slack post failed: ${slackPostError}`);
    }
    await moveJob(jobPath, doneDir, job, {
      completedAt: new Date().toISOString(),
      pushResult,
      deployResult,
      runtime,
      slackPostError
    });
  } catch (error) {
    const message = [
      'I hit a real blocker while running this on the server.',
      '',
      truncate(redact(error.message || error), 2200),
      '',
      'I saved the job and context so the next run can continue from it.'
    ].join('\n');
    console.error(redact(error.stack || error.message || error));
    contextSnapshot = await appendTurn({
      at: new Date().toISOString(),
      role: 'assistant',
      user: workerName,
      jobId: job.id,
      text: message
    });
    await postSlackMessage(message).catch((postError) => {
      console.error(`Failed to post Slack error: ${redact(postError.message)}`);
    });
    await moveJob(jobPath, failedDir, job, {
      failedAt: new Date().toISOString(),
      error: truncate(redact(error.message || error), 4000),
      contextFiles: {
        summaryPath,
        recentPath,
        sessionPath
      },
      contextSize: contextSnapshot.summary.length + contextSnapshot.recent.length
    });
  }
}

async function loop() {
  await ensureDirectories();
  await rebuildContextFiles();
  console.log(`${workerName} Codex worker started. Watching ${jobDir}.`);

  for (;;) {
    const claimed = await claimNextJob();
    if (!claimed) {
      await sleep(pollIntervalMs);
      continue;
    }
    await handleJob(claimed);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loop().catch((error) => {
    console.error(redact(error.stack || error.message || error));
    process.exit(1);
  });
}
