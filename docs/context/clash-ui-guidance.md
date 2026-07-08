# Clash UI Guidance

This file is durable context for mavebot's Clash of Clans Discord features.
Every Slack/Codex worker task that touches Clash commands should read it after
`operating-memory.md` and `slack-session.md`.

## Product Target

- mavebot should feel like a compact Clash helper, not a generic demo bot.
- Discord command output should be dense, readable on mobile, and split into
  focused pages/buttons when the data would otherwise become a long wall.
- The visual target is close to ClashKings/Wizard-style Discord cards:
  dark embed, short sections, official-looking Clash icons, and a single clear
  action row rather than many separate spam messages.
- Do not make a command look live until the change is on GitHub `origin/main`,
  deployed on the server, and the Discord runtime/command registration path has
  been checked.

## Clash Data And Icon Sources

- Use the official Clash of Clans API for player/clan/game data.
- The official player API does not provide troop, spell, hero equipment, or pet
  sprite URLs. Do not invent URLs from the player payload.
- For item icons, prefer the Clash of Clans Wiki on Fandom through the
  MediaWiki API:
  `https://clashofclans.fandom.com/api.php?action=query&titles=File:<Name>_info.png&prop=imageinfo&iiprop=url&format=json&origin=*`
- Example lookups:
  - `Lightning Spell` -> `File:Lightning_Spell_info.png`
  - `Archer Queen` -> `File:Archer_Queen_info.png`
  - `Spiky Ball` -> `File:Spiky_Ball_info.png`
- Some dotted names need exact filename overrides, such as `P.E.K.K.A`,
  `L.A.S.S.I`, and `M.E.C.H.A`.
- If an icon cannot be fetched quickly, degrade to a labeled placeholder tile
  instead of failing the Discord command.
- Avoid scraping random Google image results. If a new source is added, document
  why it is more reliable than Fandom and how to query it repeatably.

## `/player` Shape

- `/player tag:<tag>` should use one Discord interaction message with buttons.
- Current page model:
  - `Overview`: trophies, clan, war/attack profile.
  - `Army`: attached rendered PNG card with Heroes, Pets, Troops, Spells,
    Equipment, and Siege Machines using real icons when available.
  - `Heroes`: hero and equipment text summary.
  - `Progress`: achievements, Legend stats, and donation totals.
- Keep the Overview compact so the first response is readable without scrolling.
- Send the Overview as soon as the official API lookup finishes; Fandom icon
  lookup and army-card rendering should hydrate afterward so Discord does not
  sit in the loading state.
- Put high-volume item grids in an attached image card, not in many embed fields.
- Button menus should clear stale image attachments when changing away from the
  Army page.
- Button menus may expire; expired buttons should tell the user to rerun the
  command instead of throwing Discord interaction errors.

## Context Hygiene

- Long-lived Slack control will accumulate messages forever. Do not treat old
  Slack transcript rows as active tasks.
- Keep `docs/context/slack-session.md` focused on facts, decisions, and open
  work. If it gets noisy, restructure it and delete duplicated stale bullets
  after preserving the durable fact in the right section.
- Add new focused context files under `docs/context/` when a domain needs stable
  guidance, and keep each file bounded.
- Secrets and raw env values never belong in context docs.
