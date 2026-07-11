# Clash Product Delivery Playbook

This is the acceptance contract for broad Clash requests in Discord `#codex`,
especially asks that mention ClashKing, ClashPerk, roster building, CWL, war
history, activity, scheduled collection, or "the same data structure".

## Why This Exists

On 2026-07-09 the Discord channel asked mavebot to research how ClashKing and
ClashPerk collect trophies, CWL, and war stats, then create the same kind of
data structure so mavebot could start collecting data for cared-about players.
The worker replied only that a backend collector was added. That was not good
enough: it skipped the plan, did not mention sources, did not explain official
API limits, did not show a command, and gave no demo.

Future jobs must treat that as the known failure pattern.

The same day also exposed the roster-planning version of the bug. The channel
asked for a `/roster` build plan, a demo, signup/enrollment thinking, and
context/process improvements. mavebot first answered with only a tiny status
reply, then later described non-existent commands like `/roster enroll` and
`/roster build`. Future jobs must correct stale plans against the actual source
before repeating them.

## Completion Gate

A broad Clash product job is not done until the final answer can honestly cover
all of this:

1. **What the user asked for.** Name the actual product outcome, not just the
   code module touched.
2. **What was checked.** Inspect current source and context docs. When the
   request asks for current competitor behavior, check public sources such as
   ClashKing docs/source, ClashPerk docs/source, and the official Clash API.
3. **Data reality.** State what mavebot can know now, what starts collecting
   from this point forward, and what cannot be reconstructed because it was not
   stored earlier.
4. **Visible user outcome.** Ship or update a slash command when the user asked
   to build/create/start collecting. Backend-only work is incomplete unless a
   real blocker prevents a command, and the final answer must say that plainly.
5. **Command/data model.** Name the command path and the store buckets or files
   involved.
6. **Demo or next command.** Include a realistic example command and a compact
   sample result, or the exact next command slice if this run could not safely
   build it.
7. **Verification.** For code changes, update tests. For slash commands, verify
   registration and runtime handling. For live claims, rely on the wrapper's
   post-push deploy/health verification.

## Product Bias

- Prefer a small working command over a large invisible foundation.
- Build from the current `/shared/clash-history.json` store unless there is a
  concrete reason to add a new durable file.
- Current entry points are `/config clan set`, `/config clan status`,
  `/link player`, `/link status`, `/link remove`, `/track`, `/history player`,
  `/roster plan`, `/roster signup`, `/roster status`, `/roster export`, `/warstats`,
  `/activity`, and `/summary`.
- The next missing visible surfaces are richer paged roster/player views,
  reminders, and deeper war/CWL/activity pages once more scheduled data
  accumulates.
- Use command names that actually exist in `src/commands.mjs` and
  `src/index.mjs`. Do not promise `/roster enroll` or `/roster build` unless
  the same run implements, registers, and tests those exact commands.
- If a user asks for "ClashKing/ClashPerk style" without naming a command,
  infer the next useful leadership workflow: setup, tracking, signup, roster
  planning, war/CWL reliability, activity, exports, or richer pages on the
  existing commands.
- Do not copy competitors exactly. Use public feature shape to build mavebot's
  focused clan-operations version.

## Required Final Shape

Use this shape for broad Clash product replies:

```text
I found the gap: <one sentence>.

What I learned: <sources/context checked and the product lesson>.
Data reality: <what can be known now, what starts collecting now, what cannot be backfilled>.

Built now: <visible command or honest blocker>.
Data model: <store/files/buckets>.
Try: </command example>.
What it shows: <compact demo>.

Still missing: <next slice, if any>.
```

Keep it human. Do not paste raw logs, commit hashes, or test dumps unless
something failed.

## Wrapper Gate

The server wrapper rejects thin Clash product-discovery answers before posting
them as successful. A final answer is incomplete when it lacks the required
shape above, especially if it says only that a backend collector, data
structure, or ClashKing-style foundation was added.

If the worker catches itself in this state, it should not call the job done.
It must rerun the actual delivery pass: read the source and context, check the
public competitor/API facts when relevant, build the next visible command slice
or state an honest blocker, update tests/docs, and give the command/demo answer.

## Anti-Patterns

- "Added the backend collector. Done and live."
- "Made it like ClashKing" without naming commands, data, source limits, and a
  demo.
- Research-only answers after the user asked to build.
- Backend-only changes when a visible command slice was feasible.
- Saying "use `/roster`" without explaining setup, tracked history, and what
  data is still shallow.
- Repeating stale command names from older Discord answers instead of checking
  the current source.
- Ignoring a previous Discord complaint that the plan/demo was skipped.
