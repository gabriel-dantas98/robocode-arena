# Lab battle UX + drafts + docs — 2026-07-24

**Territory:** labs / robocode-arena

## Goals

1. Visible projectiles on Lab + workshop canvas
2. Short epic round-start overlay (client-only, does not pause engine)
3. Hybrid drafts: autosave current + named localStorage library
4. In-Lab mini guide with links to official Tank Royale docs

## Bullets

- Engine `onTickEvent` includes `bullets[]` from `tick.bulletStates` (`id`, `ownerId`, `x`, `y`, `direction`, `power`, `color`)
- Emit every turn while any bullet is in flight (else keep 1/3 sampling)
- Client `arena-fx.js` draws glow trails; Lab + workshop `drawArena` call it

## Intro / pacing

- Engine `startDelayMs` for countdown during BOOTING
- **Do not** `Thread.sleep` on tick in the engine — BattleRunner uses a single-thread queue; sleep made the next Lab deploy stick in `BOOTING` with **zero ticks** (empty canvas)
- Spectator TPS = **client playback queue** (`playbackMs` from Ritmo: cinema/watch/normal), same idea as the official GUI TPS slider
- Placar waits for the playback queue to drain

## Drafts

- Autosave: `lab:draft:{lang}` (existing) + dirty/saved badge
- Library: `lab:library:{lang}` → `{ id, name, botName, source, exampleId, difficulty, savedAt }[]` max 20
- UI: Salvar como… / select / Carregar / Apagar

## Docs panel

- Toggle “Docs” in Lab toolbar
- Short PT copy: bot loop, events, Lab vs workshop zip
- Links: getting started, my first bot, API per lang (robocode.dev / robocode-dev.github.io)

## Out of scope

Cloud sync, audio, pausing the engine for countdown
