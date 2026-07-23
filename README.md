# Robocode Arena

Lobby local para dinâmicas de time com [Robocode Tank Royale](https://robocode.dev/).

**Contrato:** a partida roda 100% na engine oficial (`robocode-tankroyale-runner` 1.0.2). Nossa abstração é só lobby (sala, nick, cor, **chassis visual**, zip, ready/play) + observer no browser para o projetor. Chassis **não** altera física — é skin.

## Arquitetura

```
players ──zip──▶ lobby (Bun/Hono) ──botPaths──▶ engine sidecar (Ktor)
                      │                              │
                      │ SSE room                     │ BattleRunner.embeddedServer()
                      ▼                              ▼
                 browser lobby              Robocode server + bots
                      │
                      └── WS ticks ──▶ canvas observer (skins)
```

## Pré-requisitos

| Tool | Notas |
|---|---|
| **Java 21+** | `brew install openjdk@21` |
| **Bun** | lobby + scripts |
| Runtimes dos bots | Node/tsx (TS), `python3`, `dotnet` conforme zip |
| (opcional) ngrok | link público pra sala |

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
```

## Subir tudo (workshop)

### Opção A — one-shot

```bash
cd /path/to/robocode-arena
bash scripts/dev.sh          # engine :7601 (Xmx768m) + lobby :7610
# outro terminal, opcional:
bun scripts/tunnel.ts
```

Abrir no projetor: **http://127.0.0.1:7610**

Parar: `bash scripts/stop.sh`

### Opção B — dois terminais

```bash
# 1) engine
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
cd apps/engine
./gradlew installDist --no-daemon   # só na 1ª vez / após mudar Kotlin
ENGINE_PORT=7601 JAVA_OPTS="-Xmx768m -XX:+UseG1GC" \
  ./build/install/robocode-arena-engine/bin/robocode-arena-engine

# 2) lobby
cd apps/lobby
bun install
LOBBY_PORT=7610 LOBBY_MAX_PLAYERS=40 ENGINE_URL=http://127.0.0.1:7601 \
  bun run src/server/index.ts
```

### Env úteis

| Var | Default | Uso |
|---|---|---|
| `ENGINE_PORT` | `7601` | HTTP/WS do sidecar |
| `ENGINE_XMX` | `768m` | heap do engine (`dev.sh`) |
| `ENGINE_MAX_BOTS` | `220` | hard refuse (após rebuild) |
| `LOBBY_PORT` | `7610` | UI |
| `LOBBY_MAX_PLAYERS` | `40` | soft cap da sala |
| `ENGINE_URL` | `http://127.0.0.1:7601` | lobby → engine |
| `PUBLIC_URL` | — | base do link (ngrok) |

**Workshop safe:** ≤40 players. Não rode matriz 500 com outras apps abertas (cliff ~200 pass / 500 fail neste Mac 16GB).

## Fluxo do dia

1. Owner cria lobby → copia link (ou ngrok)
2. Cada player: nick + **cor** + **chassis** (Segfault / Stack Overflow / Tech Debt / It Works™ / Bikeshed) + upload zip
3. Ready → owner Play
4. Observer no browser (LIVE + arena) no projetor

### Zip do bot

`BotName/BotName.json` + um de:

| Ext | Lang |
|---|---|
| `.ts` / `.js` | TypeScript / JavaScript |
| `.java` / `.jar` | Java |
| `.py` | Python |
| `.cs` / `.csproj` | C# |

JSON: `name`, `version`, `authors`.

Deps TS compartilhadas: `bots/node_modules` (já linkadas no extract).

## Chassis (skins — piadas de eng)

| ID | Nome | Piada |
|---|---|---|
| `segfault` | Segfault | Undefined behavior com lagartas |
| `stackoverflow` | Stack Overflow | Copia a resposta aceita sem ler o resto |
| `techdebt` | Tech Debt | Monólito: todo mundo depende, ninguém mexe |
| `docker` | It Works™ | "Roda em qualquer lugar" (cite essa frase) |
| `bikeshed` | Bikeshed | Discute a cor; o build fica pra depois |

Vibe r/ProgrammerHumor · definidos em `apps/lobby/src/shared/tanks.ts` + draw em `client/tanks.js`.  
Só canvas — **Battle Runner não sabe disso**.

## Fixtures & gravação

```bash
# zips e2e
bots/fixture/zips/{AlphaBot,BravoBot,CharlieBot}.zip

# gravar partida completa (engine+lobby no ar)
bun scripts/record-match.ts
# → recordings/match-<timestamp>.webm
```

## E2E

```bash
cd e2e && bun install && bunx playwright install chromium
# engine+lobby up
LOBBY_URL=http://127.0.0.1:7610 bunx playwright test
```

Artefatos: `e2e/artifacts/`.

## Scale matrix

```bash
# stubs JVM leves (-Xmx32m por bot)
bun scripts/scale/generate-stubs.ts 500   # se ainda não gerou
bun scripts/scale/run-matrix.ts --sizes 3,10,40          # leve
# bun scripts/scale/run-matrix.ts --sizes 100,200 --merge  # pesado
```

Resultados: `docs/SCALE.md` + `data/scale-results/`.

## Estrutura

```
apps/lobby/     Bun + Hono + client (lobby + observer)
apps/engine/    Ktor wrapper → BattleRunner 1.0.2
bots/           stubs, fixtures, node_modules da API TS
scripts/        dev.sh, stop.sh, record-match, scale, tunnel
e2e/            Playwright
recordings/     webm de partidas
docs/SCALE.md   matriz de carga
```

## Deploy

Ver **[docs/DEPLOY.md](./docs/DEPLOY.md)**.

Resumo:
- **Workshop:** `bash scripts/dev.sh` + `bun scripts/tunnel.ts` (ngrok)
- **VPS:** `docker compose up -d --build` → `:7610`
- **Não** roda em Vercel/serverless (bots = processos OS no mesmo host da engine)

```bash
docker compose up -d --build
# http://localhost:7610
```

| Sintoma | Fix |
|---|---|
| `ERR_CONNECTION_REFUSED :7610` | lobby down → `bun run src/server/index.ts` |
| bots TS `ERR_MODULE_NOT_FOUND` | `cd bots && bun install` (symlink no upload) |
| battle “already in progress” | engine serializa 1 battle; espere ENDED |
| Mac sem RAM | `bash scripts/stop.sh`; não rode N≥100 |
| MIME JS quebrado | `/client/*.js` deve vir `text/javascript` (já no server) |
