#!/usr/bin/env python3
import hashlib
import hmac
import http.server
import json
import os
import subprocess
import threading


SECRET = os.environ.get("WEBHOOK_SECRET", "")
HOST = os.environ.get("WEBHOOK_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBHOOK_PORT", "4189"))
PATH = os.environ.get("WEBHOOK_PATH", "/discord-bot-deploy")
DEPLOY_SCRIPT = os.environ.get(
    "DEPLOY_SCRIPT", "/opt/urba-apps/discord-bot/app/scripts/deploy-server.sh"
)
MAX_BODY_BYTES = int(os.environ.get("WEBHOOK_MAX_BODY_BYTES", str(5 * 1024 * 1024)))

deploy_lock = threading.Lock()
deploy_running = False


if not SECRET:
    raise RuntimeError("WEBHOOK_SECRET is required.")


def verify_signature(body, signature_header):
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(
        SECRET.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def finish_deploy(process):
    global deploy_running
    process.wait()
    with deploy_lock:
        deploy_running = False


def run_deploy():
    global deploy_running
    with deploy_lock:
        if deploy_running:
            return False

        deploy_running = True
        process = subprocess.Popen(
            ["/usr/bin/env", "bash", DEPLOY_SCRIPT],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        threading.Thread(target=finish_deploy, args=(process,), daemon=True).start()
        return True


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "MaveDeployWebhook/1.0"

    def write_text(self, status, message):
        body = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?", 1)[0] != PATH:
            self.write_text(404, "not found\n")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.write_text(400, "invalid content length\n")
            return

        if content_length > MAX_BODY_BYTES:
            self.write_text(413, "payload too large\n")
            return

        body = self.rfile.read(content_length)
        signature = self.headers.get("X-Hub-Signature-256")
        if not verify_signature(body, signature):
            self.write_text(401, "invalid signature\n")
            return

        event = self.headers.get("X-GitHub-Event")
        if event == "ping":
            self.write_text(200, "pong\n")
            return

        if event != "push":
            self.write_text(202, "ignored event\n")
            return

        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self.write_text(400, "invalid json\n")
            return

        if payload.get("ref") != "refs/heads/main":
            self.write_text(202, "ignored ref\n")
            return

        started = run_deploy()
        self.write_text(202, "deploy started\n" if started else "deploy already running\n")

    def do_GET(self):
        self.write_text(405, "method not allowed\n")

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Deploy webhook listening on {HOST}:{PORT}{PATH}.", flush=True)
    server.serve_forever()
