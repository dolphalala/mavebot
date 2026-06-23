import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const secret = process.env.WEBHOOK_SECRET;
const port = Number.parseInt(process.env.WEBHOOK_PORT || '4189', 10);
const host = process.env.WEBHOOK_HOST || '127.0.0.1';
const deployScript =
  process.env.DEPLOY_SCRIPT || '/opt/urba-apps/discord-bot/app/scripts/deploy-server.sh';

if (!secret) {
  throw new Error('WEBHOOK_SECRET is required.');
}

let deployRunning = false;

function verifySignature(body, signatureHeader) {
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const actual = signatureHeader;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function runDeploy() {
  if (deployRunning) {
    return false;
  }

  deployRunning = true;
  const child = spawn('/usr/bin/env', ['bash', deployScript], {
    detached: true,
    stdio: 'ignore'
  });

  child.on('exit', () => {
    deployRunning = false;
  });

  child.unref();
  return true;
}

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end('method not allowed\n');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    if (!verifySignature(body, req.headers['x-hub-signature-256'])) {
      res.writeHead(401);
      res.end('invalid signature\n');
      return;
    }

    const event = req.headers['x-github-event'];
    if (event === 'ping') {
      res.writeHead(200);
      res.end('pong\n');
      return;
    }

    if (event !== 'push') {
      res.writeHead(202);
      res.end('ignored event\n');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      res.writeHead(400);
      res.end('invalid json\n');
      return;
    }

    if (payload.ref !== 'refs/heads/main') {
      res.writeHead(202);
      res.end('ignored ref\n');
      return;
    }

    const started = runDeploy();
    res.writeHead(202);
    res.end(started ? 'deploy started\n' : 'deploy already running\n');
  });
});

server.listen(port, host, () => {
  console.log(`Deploy webhook listening on ${host}:${port}.`);
});
