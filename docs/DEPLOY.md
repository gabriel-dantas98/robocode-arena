# Deploy — Robocode Arena

## Realidade

A engine é o **Battle Runner oficial**. Cada bot é um **processo OS** (Java/Node/Python/…).  
Por isso:

| Target | Serve? | Por quê |
|---|---|---|
| Mac local + ngrok | ✅ workshop | o que já usamos |
| VPS / Docker (1 máquina) | ✅ | processos no mesmo host |
| Fly.io / Railway (VM) | ✅ possível | precisa RAM (≥2–4GB) |
| Vercel / serverless | ❌ | sem spawn de bot JVM/Node persistente |
| K8s multi-pod | ⚠️ difícil | bot paths + server precisam do mesmo host |

**Regra:** lobby e engine (+ bots) no **mesmo host**. Lobby só orquestra; engine sobe o server Robocode e os `.sh` dos zips.

## Opção 0 — Dia do workshop (recomendado)

```bash
bash scripts/dev.sh
bun scripts/tunnel.ts   # ngrok → PUBLIC_URL
```

Projetor: `http://127.0.0.1:7610` · players: URL do tunnel.

Parar: `bash scripts/stop.sh`

## Opção 1 — Docker Compose (VPS)

Máquina: Ubuntu 22.04+, **≥4GB RAM**, portas 7610 (e 80/443 se proxy).

```bash
git clone git@github.com:gabriel-dantas98/robocode-arena.git
cd robocode-arena
docker compose up -d --build
# UI: http://<IP>:7610
```

Volumes: uploads em `arena-uploads`. Logs: `docker compose logs -f`.

Proxy (Caddy exemplo):

```caddy
arena.seudominio.com {
  reverse_proxy localhost:7610
}
```

Set `PUBLIC_URL=https://arena.seudominio.com` no compose pra link da sala bater.

## Opção 2 — Railway (smoke verified)

Single Docker service = lobby + engine + bot processes on one container.

```bash
# once (logged in)
cd robocode-arena
railway init -n robocode-arena -w "<workspace-id>"
railway add -s arena \
  --variables "ENGINE_PORT=7601" \
  --variables "ENGINE_URL=http://127.0.0.1:7601" \
  --variables "LOBBY_MAX_PLAYERS=20" \
  --variables "JAVA_OPTS=-Xmx512m -XX:+UseSerialGC"
railway service link arena
railway up -d -c
railway domain   # → https://….up.railway.app
railway variables set PUBLIC_URL=https://….up.railway.app
```

Config no repo: [`railway.toml`](../railway.toml) (Dockerfile builder + `/api/health`).

**Smoke (2026-07-24):**

- URL: https://arena-production-1bcf.up.railway.app
- `/api/health` → `engineOk: true`
- `LOBBY_URL=https://arena-production-1bcf.up.railway.app bun scripts/record-match.ts` → partida 3 bots `ended`

Notas:

- Precisa **≥2GB RAM** no serviço (ideal 4GB). Smoke usou `JAVA_OPTS=-Xmx512m`.
- Lobby honra `PORT` (Railway) e faz **proxy WS** `/api/battles/:id/ws` → engine interno (browser não fala com `:7601`).
- **Viewer nativo:** `/viewer/` (Tank Royale Viewer / Pixi) + proxy Observer `wss://…/tr` → server TR embutido (`TR_SERVER_PORT=7654`). Secret injetado no proxy (não vaza pro browser).
- Uploads são efêmeros sem volume; adicione `railway volume` se quiser persistir.
- Custo: plano Hobby/Pro conforme uso — não é free-tier confortável pra muitos bots.

## Opção 3 — Fly.io (sketch)

Precisa de **Fly Machine** com memória alta (não Free tier confortável).

```bash
# fly.toml minimal — ajuste memory
fly launch --no-deploy
fly scale memory 4096
fly deploy
```

`Dockerfile` na raiz já sobe engine+lobby no mesmo container.  
Custo e cold start: avalie vs VPS barato (Hetzner CX22 etc.).

## Opção 4 — Só lobby na cloud? Não

Separar lobby (Vercel) e engine (VPS) quebra o fluxo de zip→path local→`BotEntry.of(path)`.  
Dá pra fazer com volume compartilhado / object storage + sync, mas é overkill pro workshop.

## Checklist pré-deploy

- [ ] `bots/node_modules` instalável na imagem (`@robocode.dev/tank-royale-bot-api`, `tsx`)
- [ ] Java 21 no host/imagem
- [ ] `LOBBY_MAX_PLAYERS` ≤40 no workshop
- [ ] Não expor `:7601` publicamente sem necessidade
- [ ] Disco pra uploads + stubs

## Segurança (MVP)

- Owner token no header — não é auth forte
- Zips validados (path traversal / size) — ainda é código de terceiros rodando no host
- Em VPS: firewall só 80/443/22; rode como user não-root no compose se endurecer depois
- Confie só em players da sala (evento interno)

## O que não vai pro cloud “fácil”

Matriz 200–500 bots: precisa de máquina dedicada. Documentado em `docs/SCALE.md` (cliff ~200 neste Mac 16GB).

## Lab IDE (`/lab`)

Superfície solo (Monaco + Deploy) documentada em `docs/superpowers/specs/2026-07-24-lab-ide-design.md`.

Imagem Docker: **JDK 21** + `pip install robocode-tank-royale` (não só JRE).
