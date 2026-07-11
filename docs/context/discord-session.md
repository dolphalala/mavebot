# Mavebot Discord Session Memory

This is the canonical durable memory for the Discord `#codex` remote Codex
session. Read it after `docs/context/operating-memory.md` and before changing
remote-runner behavior, Discord slash commands, Clash of Clans features, or
long-lived server state.

## Current Goal

- Discord `#codex` should feel like a normal mavebot working session, close to
  a local Codex Desktop session for this repo.
- Any non-bot user in the configured `#codex` channel can speak normally
  without tagging mavebot.
- Adjacent text messages and uploads should be treated as one working turn when
  they are sent close together.
- Live Discord intake should keep one user's quick follow-up messages together
  but avoid merging different users' simultaneous prompts into one job.
- Nearby Discord channel messages from any user should be available as
  background context for follow-ups, screenshots, and collaboration without
  becoming extra hidden tasks.
- Nearby context should survive deploys and restarts through the bounded
  Discord context log, not only through live process memory.
- mavebot should post normal channel replies, not thread-only replies, task
  cards, prompt dumps, or deployment logs.
- The server-side `codex-worker` container is the normal backend for repo
  tasks.

## Remote UX Decisions

- Brief working messages should sound human and short. They are only a visible
  "I got this" acknowledgement, not a final answer.
- Very short connectivity checks such as "hello", "test", or "is this
  working" should answer immediately from mavebot and write a completed worker
  record so restart catch-up does not replay them. Real requests, screenshots,
  and anything command-like still go through the full Codex worker.
- Very short queue checks such as "status", "queue", "are you busy", and
  "what are you working on?" should also answer immediately from runtime queue
  and auth state.
- Long code/deploy jobs should not sit silently after the first acknowledgement.
  Post a few short progress notes when a stage runs long, using normal human
  language, then give the real final answer after verification.
- Extra messages or screenshots sent by the same user during the short debounce
  window should be accepted into the same active turn without posting another
  channel message. mavebot can use a quiet reaction for those follow-ups so the
  user can tell the message was caught.
- Changed-file jobs should trigger the server-local private deploy webhook from
  the worker when configured, then still verify the live commit and health. The
  30-second poll deploy timer is only the fallback.
- If Allen, Lana, or another user asks for a plan, demo, explanation, design,
  review, screenshot analysis, database model, or "how this works," preserve
  enough structure in the final answer to actually answer it.
- If Allen asks to research ClashKing/ClashPerk or build a competitor-style
  Clash feature, treat it as product-discovery plus implementation. Do not
  answer with a half-line "done" message; include what was learned, command
  roadmap, data model, current slice, and a demo/next command.
- For broad multi-part asks, keep an internal checklist and continue through
  obvious next steps. Do not make the user repeat the same instruction.
- If a worker job contains multiple Discord `contextMessages`, answer every
  explicit ask in order, preserve relevant speaker/file context, and use the
  newest message only to resolve conflicts.
- Keep final answers readable for non-technical Discord users. Say the result
  first, mention blockers plainly, and avoid commit/test/deploy details unless
  they explain a failure.
- Do not say a change is live until the worker has pushed `origin/main`, the
  server deploy has pulled it, and the runtime health or command path has been
  checked.
- Do not touch Chatwoot, Bookkeeper, nginx, Docker daemon settings, or other
  apps on the shared server unless the user explicitly asks for that exact app.

## Memory Model

- Worker memory lives under
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/`.
- `discord-channel-context.jsonl` is the bounded recent Discord `#codex`
  channel tail used for short-term references like "above", "that screenshot",
  and "what did you do?" It is not the long-term brain.
- The context log should prune low-signal smoke tests and working
  acknowledgements so future prompts do not inherit old verification chatter.
- `transcript.jsonl` is normalized history.
- `summary.md`, `recent.md`, and `session.md` are regenerated bounded context
  files for future prompts.
- Recent worker job JSON records in `done/`, `failed/`, and `auth-blocked/`
  are included in prompts as a bounded audit trail for follow-up questions such
  as "what did you do?" and "why didn't that work?"
- Recent worker job summaries include compact active-turn shape: message count,
  users, file counts, lanes, and multi-agent hints.
- `auth-blocked/` job records count as handled message IDs for catch-up, so
  login-held requests are not replayed as duplicates after a restart.
- Durable product, deployment, and user-preference facts belong in
  `docs/context/*.md`, not in raw channel history.
- Keep context docs compact. Move domain rules into focused files and rewrite
  noisy sections instead of appending repeated status notes.
- Never store secrets, raw env values, OAuth tokens, cookies, or private keys in
  context docs.
- 2026-07-09 latency investigation: no-change worker smokes were around 7-8
  seconds; changed-file jobs should use the private deploy webhook before
  relying on the poll timer.
- 2026-07-09 live verification: private deploy webhook triggered from the
  worker and the poll timer remained fallback.

## Persistent Product Context

- Allen is Korean and Lana is Croatian.
- Lana will manage this app.
- mavebot is a sweet helper identity for the app; the tone can be warm and
  lightly affectionate when appropriate, but it should still be clear.
- The Discord bot is Clash of Clans focused and uses the official Clash of
  Clans API from server-side environment variables.
- Clash UI and icon-source guidance lives in `docs/context/clash-ui-guidance.md`.
- ClashKing/ClashPerk public-source research and product-discovery response
  rules live in `docs/context/clash-competitor-research.md`.
- ClashKing/ClashPerk-style database and collector guidance lives in
  `docs/context/clash-database-guidance.md`.
- `/ping` is no longer a public Discord slash command.
- `/lana` replaced `/iloveyou` and sends a generated PNG heart image with a
  Lana/Allen embed.
- `/loveu user:<discord user>` composes a randomized love poem and attaches a
  generated heart image.
- `/player` should stay compact with button pages and image cards for dense
  army/equipment data.
- `/legends player:<tag>` tracks Legend League trophy snapshots in
  `/shared/legends-tracking.json`.
- `/track player:<tag>`, `/track clan:<tag>`, and `/track status` seed and
  report the Clash history store at `/shared/clash-history.json`. Future
  `/history`, `/roster`, `/warstats`, `/activity`, and `/summary` work should
  build on that store.
- `/pictionary` is a Clash of Clans picture guessing game using Clash-style
  assets, difficulty settings, chat guesses, and a durable guild leaderboard.
- `/elder`, `/mute`, and `/bench` use `/shared/elder-votes.json`; Discord role
  hierarchy still applies even with administrator permissions.

## Open Work

- The server-side Codex CLI auth is the critical external dependency. If
  `codex exec` returns `HTTP 401`, `token_invalidated`, or
  `refresh_token_invalidated`, complete a fresh device-auth login for the
  mounted server `CODEX_HOME`. Allen wants that server login to use
  `billing@urba.media`.
- Keep the GitHub repository synchronized with live server changes so worker
  jobs and server auto-deploys use the same code.
- Continue improving Discord commands for Clash of Clans workflows, especially
  roster, history, war/CWL, and database-backed clan operations.
- Keep broad Clash product asks from collapsing into tiny replies. A request
  like "research how ClashKing and ClashPerk work and create the same data
  structure" should produce a researched plan plus a concrete code/docs/test
  slice, or a clear blocker and next slice.
- Keep Discord file/screenshot intake reliable: attachments should be
  downloaded to `/shared/codex-worker/context/discord-files/` and supported
  images should be passed to `codex exec` with `--image`.
- Keep response-quality audits possible: completed worker jobs should preserve
  sanitized inner Codex output and final mavebot channel output so skipped asks
  can be diagnosed from server records instead of guessing from chat alone.
- The July 2026 Discord audit found three recurring quality gaps to keep
  guarding against: skipped plan/demo answers on broad requests, overly short
  "fixed it" replies that hide what changed, and auth-expired jobs looking like
  silent hangs unless `/healthz` exposes the worker auth state.
- Working acknowledgements account for other pending Discord bursts as well as
  jobs already on disk, so simultaneous users see clearer queued language while
  the active user's own debounce window still feels immediate.
- `/healthz` exposes pending Discord burst summaries with safe counts for
  messages and files, so "did it catch my follow-up/screenshot?" can be checked
  without reading raw prompt text.
- `status`/`queue` style channel checks answer from `/healthz`-equivalent
  runtime state and write immediate done records. They are low-signal status
  rows, not durable project context.
- Keep memory efficient as Discord channel history grows: summarize durable
  facts, move domain guidance into focused files, and delete duplicated stale
  notes once the facts are preserved.
