# Robocode Arena

Lobby local para dinâmicas de time com [Robocode Tank Royale](https://robocode.dev/).

## Fluxo

1. Owner cria sala e compartilha link (ngrok opcional)
2. Players entram com nick + cor + upload de zip (**multi-lang**)
3. Ready → owner dá Play
4. Engine sobe a battle (Battle Runner) e o **observer próprio** renderiza a arena na mesma UI (projetor)

## Linguagens aceitas no zip

Estrutura: `BotName/BotName.json` + um destes:

| Extensão | Lang |
|---|---|
| `.ts` / `.js` | TypeScript / JavaScript |
| `.java` / `.jar` | Java |
| `.py` | Python |
| `.cs` / `.csproj` | C# / .NET |

JSON obrigatório: `name`, `version`, `authors`.

## Requisitos

- Java 21+ (`brew install openjdk@21`)
- Bun
- Runtime da lang dos bots (Node/tsx, python3, dotnet…)
- (opcional) ngrok

## Subir no dia

```bash
# terminal 1 — engine
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd apps/engine && ./gradlew installDist
ENGINE_PORT=7601 JAVA_OPTS=-Xmx2g ./build/install/robocode-arena-engine/bin/robocode-arena-engine

# terminal 2 — lobby
cd apps/lobby && bun install && bun run dev

# terminal 3 — tunnel (opcional)
bun scripts/tunnel.ts
```

Ou: `bash scripts/dev.sh`

Abra `http://127.0.0.1:7610` no notebook do projetor.

## Fixtures

`bots/fixture/zips/{AlphaBot,BravoBot,CharlieBot}.zip` (TypeScript)

## Scale matrix

```bash
bun scripts/scale/run-matrix.ts --sizes 3,10,40,100,200,500
```

Resultados: `docs/SCALE.md` + `data/scale-results/`.

## E2E

```bash
cd e2e && bun install && bunx playwright install chromium
bunx playwright test
```

Vídeos em `e2e/artifacts/`.
