# Lab IDE — Design

**Date:** 2026-07-24  
**Status:** approved (brainstorm)  
**Territory:** labs / robocode-arena

## Goal

A solo **IDE-like** surface at `/lab` where a user pastes or opens tank source, clicks **Deploy**, and runs a test battle against **3 clones** of a chosen difficulty (Easy / Medium / Hard) — without joining a workshop room.

## Non-goals

- Zip download / workshop bridge
- Auth, nick, global ranking
- Language server / pre-Deploy compile check
- Wake Lock, fullscreen, Web Locks (deferred)
- Custom/editable opponent AI
- Multiplayer inside the lab
- Replacing `/` workshop lobby

## Product decisions (locked)

| Decision | Choice |
|---|---|
| Surface | Dedicated `/lab` (workshop stays) |
| Match shape | Pick difficulty → you vs **3 clones** of that tier |
| Languages (day 1) | TypeScript, Java, Python |
| Deploy | Empacota + run only (no export zip) |
| Architecture | Lab API dedicada (não sala fantasma) |
| Browser moderno | Só **File System Access** (`showOpenFilePicker` / `showSaveFilePicker`) |

## UX

Desktop split: Monaco editor (left) + arena canvas observer (right).

Controls: lang picker, difficulty picker, bot name, **Deploy**, **Abrir** / **Salvar** (FS Access; hide if unsupported).

- Home CTA → `/lab`; link Lab → Workshop
- Anonymous; drafts in `localStorage` (`lab:draft:{lang}`)
- Lang switch loads template (confirm if dirty)
- Deploy disabled while battle `BOOTING|RUNNING`
- On `ended`: placar + re-Deploy
- Mobile: editor above, canvas below
- Shortcuts: `Cmd/Ctrl+Enter` Deploy; `Cmd/Ctrl+S` Save (FS Access)

## API

```http
GET  /api/lab/templates/:lang
→ { lang, botName, filename, source }

POST /api/lab/deploy
{ lang: "ts"|"java"|"python", botName, source, difficulty: "easy"|"medium"|"hard" }
→ { battleId, botPath, opponents: string[3] }

GET  /api/lab/battles/:id   # thin proxy to engine snapshot (optional if client polls engine via lobby)
WS   /api/battles/:id/ws    # existing same-origin proxy
```

### Deploy pipeline

1. Validate `botName` (`^[A-Za-z][A-Za-z0-9_]{0,31}$`), `source` ≤ 200KB, lang/difficulty enums
2. Materialize `data/lab/{id}/{BotName}/` with JSON + entry + `ensureBootAssets`
3. Opponent paths: `bots/opponents/{difficulty}/{Name1,Name2,Name3}/`
4. `POST ENGINE /battles` with `botPaths: [player, o1, o2, o3]`, `rounds: 3`
5. Return `battleId`

### Limits

- Max **1** lab battle active per process → `409` if busy
- Rate limit ~6 deploys/min/IP
- TTL: delete `data/lab/*` older than 1h
- No auth

## Opponents

| Tier | Names | Behavior |
|---|---|---|
| easy | SittingDuck1/2/3 | Near-stationary; rare fire |
| medium | Scout1/2/3 | Move + scan + fire on last scan |
| hard | Predator1/2/3 | Erratic move + simple lead aim + wall avoid |

- Implemented in **TypeScript** (same stack as fixtures), independent of player lang
- Fixed chassis/colors per tier (easy green / medium amber / hard red) for canvas readability

## Templates + editor

- `bots/lab-templates/{ts,java,python}/` — minimal bots that move + fire
- Monaco CDN; highlight only (no remote LS)
- Open file: set lang from extension; Save: extension from lang
- FS handles do not persist across reload (MVP)

## Runtime / image requirements

- **Java:** final image must be able to run `.java` bots (JDK, not JRE-only)
- **Python:** `pip install robocode-tank-royale` (or equiv.) in image / host docs
- **TS:** existing `bots/node_modules` symlink path

## Errors

- 400 validation → message under editor
- 409 busy → wait
- Bot crash / compile fail → battle `FAILED` + engine error / stderr panel

## Success criteria

- `/lab` works locally + Docker/Railway for TS, Java, Python
- Deploy vs 3 clones per difficulty reaches `ended`
- FS Access Open/Save on Chromium; graceful hide elsewhere
- Workshop routes unchanged

## Open questions

- None blocking MVP (opponent tuning post-smoke)
