# Clash UI Guidance

This file is durable context for mavebot's Clash of Clans Discord features.
Every Discord #codex worker task that touches Clash commands should read it
after `operating-memory.md` and `slack-session.md`.

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
- ClashKing and ClashPerk-style history is polling-based, not event-based. The
  official API has no push stream, so mavebot must snapshot player/clan state
  on a schedule and store deltas. Trophy changes that happen between polls
  cannot be reconstructed exactly.
- War/CWL player attack history is only reliable when mavebot sees the war from
  the active current-war/CWL endpoints. Public war logs are useful as summary
  backfill, but they do not provide full player attack rows.
- For database, polling, roster, and history design, also read
  `docs/context/clash-database-guidance.md`.
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
- Building and defense art can be level-named on Fandom, such as
  `Inferno_Tower10_Single.png` or `Cannon_level6_info.png`; asset lookup should
  fall back to the wiki page thumbnail/original image before using placeholder
  art.
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

## `/pictionary` Shape

- `/pictionary` should stay Clash-only across troops, heroes, spells, defenses,
  buildings, resources, traps, siege machines, hero pets, hero equipment,
  leagues, clan play, Builder Base, older event troops, rare obstacles, magic
  items, Clash history, notable old players/creators, and lore.
- Round cards should be generated PNGs that use Clash Wiki/Fandom item art
  when available. Generated shape art is only a fallback when an asset lookup
  fails or no reliable asset exists; abstract/history topics should have
  explicit asset aliases such as `Trophy`, `Clash of Clans`, `Raid Medal`, or
  a related page image so geometric fallback art stays rare.
- Difficulty settings should affect both answer pool and card reveal style:
  hard/expert modes should favor obscure Clash topics, older/limited items,
  history, lore, and player/community knowledge. Do not make the game harder
  mainly by removing every clue; keep at least one clue for abstract topics and
  let the answer pool carry the difficulty.
- Round cards should include category labels and optional visual/text clues,
  but they should not print the exact answer on the card.
- Chat guesses should be exact answer or documented common aliases so partial
  generic words do not steal rounds.
- Leaderboard stats are durable guild state under `/shared` and should be
  shown at the end of each multi-round game.

## Context Hygiene

- Long-lived Discord control will accumulate messages forever. Do not treat old
  transcript rows as active tasks.
- Keep `docs/context/slack-session.md` focused on facts, decisions, and open
  work. If it gets noisy, restructure it and delete duplicated stale bullets
  after preserving the durable fact in the right section.
- Add new focused context files under `docs/context/` when a domain needs stable
  guidance, and keep each file bounded.
- Secrets and raw env values never belong in context docs.
