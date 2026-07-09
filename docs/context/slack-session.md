# Mavebot Legacy Slack Session Pointer

This file remains for compatibility with older prompts and cloud tasks. The
canonical remote session memory is now `docs/context/discord-session.md`.
Normal mavebot work should use Discord `#codex`, not Slack.

## Compatibility Rules

- Read `docs/context/discord-session.md` for current goals, user preferences,
  and open work.
- Slack `#bot`, Slack OAuth, official Codex Slack, and Slack trigger channels
  are legacy-only and must not be required for Discord worker success.
- Do not start or rely on `urba-slack-bridge` unless `ENABLE_SLACK_BRIDGE=1`
  is explicitly set for a legacy Slack session.
- If an old task asks for this file, treat it as a pointer and then load
  `discord-session.md`, `remote-codex-session.md`, `local-codex-parity.md`, and
  the focused context docs.

## Legacy Slack Facts

- Legacy Slack channel ID for the old user-facing `#bot`: `C0BCG0T838B`.
- Legacy Slack app ID for the custom bridge: `A0BCMC7JKRC`.
- If Slack is deliberately re-enabled, uploads may be mirrored into
  `/shared/codex-worker/context/slack-files/`. Discord upload intake under
  `/shared/codex-worker/context/discord-files/` remains the primary path.
