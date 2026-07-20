const app = document.getElementById("app");

const state = {
  view: location.pathname.startsWith("/r/")
    ? "room"
    : location.pathname.startsWith("/scale")
      ? "scale"
      : "home",
  code: location.pathname.startsWith("/r/")
    ? location.pathname.split("/")[2]?.toUpperCase()
    : null,
  ownerToken: localStorage.getItem("arena.ownerToken"),
  playerId: localStorage.getItem("arena.playerId"),
  room: null,
  nick: localStorage.getItem("arena.nick") || "",
  color: localStorage.getItem("arena.color") || "#FF6B35",
  battleWs: null,
  lastTick: null,
  colorsByName: {},
};

function render() {
  if (state.view === "home") return renderHome();
  if (state.view === "scale") return renderScale();
  return renderRoom();
}

function renderHome() {
  app.innerHTML = `
    <div class="layout">
      <div class="panel">
        <h1>Robocode Arena</h1>
        <p class="muted">Lobby local · zip multi-lang (TS/JS/Java/Python/C#) · ready · play no projetor</p>
        <div class="row" style="margin-top:1rem">
          <button id="create">Criar lobby</button>
          <button class="ghost" id="gotoScale">Scale report</button>
        </div>
        <div class="row" style="margin-top:1rem">
          <input id="joinCode" type="text" placeholder="Código da sala" maxlength="6" style="text-transform:uppercase;width:8rem" />
          <button class="ghost" id="joinGo">Entrar</button>
        </div>
      </div>
    </div>`;
  document.getElementById("create").onclick = createRoom;
  document.getElementById("gotoScale").onclick = () => {
    history.pushState({}, "", "/scale");
    state.view = "scale";
    render();
  };
  document.getElementById("joinGo").onclick = () => {
    const code = document.getElementById("joinCode").value.trim().toUpperCase();
    if (!code) return;
    history.pushState({}, "", `/r/${code}`);
    state.code = code;
    state.view = "room";
    render();
    bootRoom();
  };
}

async function createRoom() {
  const res = await fetch("/api/rooms", { method: "POST" }).then((r) => r.json());
  state.ownerToken = res.ownerToken;
  localStorage.setItem("arena.ownerToken", res.ownerToken);
  state.code = res.room.code;
  history.pushState({}, "", `/r/${res.room.code}`);
  state.view = "room";
  render();
  bootRoom();
}

function renderRoom() {
  const room = state.room;
  const isOwner = !!state.ownerToken;
  const me = room?.players?.find((p) => p.id === state.playerId);
  const link = `${location.origin}/r/${state.code}`;

  app.innerHTML = `
    <div class="layout">
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <h1>Sala ${state.code || "…"}</h1>
            <p class="muted">Status: <strong>${room?.status || "loading"}</strong></p>
          </div>
          <div class="row">
            <button class="ghost" id="copy">Copiar link</button>
            ${isOwner ? `<button id="play" ${room?.canPlay ? "" : "disabled"}>Play</button>` : ""}
            ${isOwner && room?.status === "ended" ? `<button class="ghost" id="reset">Nova round</button>` : ""}
          </div>
        </div>
        <p class="muted" style="margin:0.5rem 0 0">Link: <code>${link}</code></p>
        ${room?.error ? `<p class="error">${room.error}</p>` : ""}
      </div>

      <div class="panel" id="joinPanel" style="${me ? "display:none" : ""}">
        <h2>Entrar na sala</h2>
        <div class="row">
          <input id="nick" type="text" placeholder="Nick" value="${escapeAttr(state.nick)}" />
          <input id="color" type="color" value="${state.color}" />
          <button id="join">Join</button>
        </div>
      </div>

      <div class="panel" id="playerPanel" style="${me ? "" : "display:none"}">
        <h2>Seu tank</h2>
        <div class="row">
          <input id="nickEdit" type="text" value="${escapeAttr(me?.nick || state.nick)}" />
          <input id="colorEdit" type="color" value="${me?.color || state.color}" />
          <button class="ghost" id="saveMeta">Salvar</button>
        </div>
        <div class="row" style="margin-top:0.75rem">
          <input id="zip" type="file" accept=".zip,application/zip" />
          <button class="ghost" id="upload">Upload zip</button>
          <button id="ready" ${me?.botPath ? "" : "disabled"}>${me?.ready ? "Unready" : "Ready"}</button>
        </div>
        <p class="muted">${me?.botName ? `Bot: ${me.botName}${me.lang ? ` · ${me.lang}` : ""}` : "Nenhum bot enviado — zip: BotName/{BotName.json + .ts|.java|.py|.cs}"}</p>
      </div>

      <div class="panel">
        <h2>Players (${room?.players?.length || 0})</h2>
        <div id="players"></div>
      </div>

      <div id="arenaWrap" style="${room?.status === "running" || room?.status === "ended" || room?.status === "starting" ? "" : "display:none"}">
        <canvas id="arena" width="1100" height="720"></canvas>
        <div class="hud" id="hud">aguardando ticks…</div>
        <div class="scoreboard" id="scoreboard"></div>
      </div>

      <div class="panel" id="resultsPanel" style="${room?.results?.length ? "" : "display:none"}">
        <h2>Resultados</h2>
        <ol class="results" id="results"></ol>
      </div>
    </div>`;

  const playersEl = document.getElementById("players");
  playersEl.innerHTML = (room?.players || [])
    .map(
      (p) => `
      <div class="player">
        <span class="swatch" style="background:${p.color}"></span>
        <span>${escapeHtml(p.nick)} ${p.botName ? `<span class="muted">· ${escapeHtml(p.botName)}${p.lang ? ` (${p.lang})` : ""}</span>` : ""}</span>
        <span class="badge ${p.ready ? "ready" : "wait"}">${p.ready ? "ready" : "waiting"}</span>
        <span class="muted">${p.id === state.playerId ? "você" : ""}</span>
      </div>`,
    )
    .join("");

  if (room?.results?.length) {
    document.getElementById("results").innerHTML = room.results
      .map(
        (r) =>
          `<li>#${r.rank} <strong>${escapeHtml(r.name)}</strong> — ${r.totalScore} pts</li>`,
      )
      .join("");
  }

  document.getElementById("copy")?.addEventListener("click", () => navigator.clipboard.writeText(link));
  document.getElementById("join")?.addEventListener("click", joinRoom);
  document.getElementById("saveMeta")?.addEventListener("click", saveMeta);
  document.getElementById("upload")?.addEventListener("click", uploadZip);
  document.getElementById("ready")?.addEventListener("click", toggleReady);
  document.getElementById("play")?.addEventListener("click", play);
  document.getElementById("reset")?.addEventListener("click", resetRoom);

  // color map for arena observer
  state.playerRoster = (room?.players || []).map((p) => ({
    nick: p.nick,
    color: p.color,
    botName: p.botName,
  }));
  if (room?.battleId && room.status === "running") connectBattle(room.battleId);
  if (state.lastTick) drawArena(state.lastTick);
}

async function bootRoom() {
  const es = new EventSource(`/api/rooms/${state.code}/events`);
  es.addEventListener("room", (ev) => {
    state.room = JSON.parse(ev.data);
    renderRoom();
  });
  // initial fetch in case SSE slow
  const res = await fetch(`/api/rooms/${state.code}`);
  if (res.ok) {
    state.room = (await res.json()).room;
    renderRoom();
  }
}

async function joinRoom() {
  const nick = document.getElementById("nick").value.trim();
  const color = document.getElementById("color").value;
  state.nick = nick;
  state.color = color;
  localStorage.setItem("arena.nick", nick);
  localStorage.setItem("arena.color", color);
  const res = await fetch(`/api/rooms/${state.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick, color }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  state.playerId = res.player.id;
  localStorage.setItem("arena.playerId", res.player.id);
  state.room = res.room;
  renderRoom();
}

async function saveMeta() {
  const nick = document.getElementById("nickEdit").value.trim();
  const color = document.getElementById("colorEdit").value;
  await fetch(`/api/rooms/${state.code}/players/${state.playerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick, color }),
  });
}

async function uploadZip() {
  const file = document.getElementById("zip").files?.[0];
  if (!file) return alert("Escolha um .zip");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/rooms/${state.code}/players/${state.playerId}/upload`, {
    method: "POST",
    body: fd,
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  state.room = res.room;
  renderRoom();
}

async function toggleReady() {
  const me = state.room.players.find((p) => p.id === state.playerId);
  await fetch(`/api/rooms/${state.code}/players/${state.playerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ready: !me.ready }),
  });
}

async function play() {
  const res = await fetch(`/api/rooms/${state.code}/play`, {
    method: "POST",
    headers: { "x-owner-token": state.ownerToken },
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  if (res.battleId) connectBattle(res.battleId);
}

async function resetRoom() {
  await fetch(`/api/rooms/${state.code}/reset`, {
    method: "POST",
    headers: { "x-owner-token": state.ownerToken },
  });
  state.lastTick = null;
  state.battleWs?.close();
}

async function connectBattle(battleId) {
  if (state.battleWs) state.battleWs.close();
  const info = await fetch(`/api/battles/${battleId}/proxy-ws-info`).then((r) => r.json());
  const ws = new WebSocket(info.wsUrl);
  state.battleWs = ws;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "tick") {
      state.lastTick = msg;
      drawArena(msg);
      const hud = document.getElementById("hud");
      if (hud) hud.textContent = `round ${msg.round} · turn ${msg.turn} · bots ${msg.bots?.length || 0}`;
    }
  };
}

function drawArena(msg) {
  const canvas = document.getElementById("arena");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // atmospheric ground
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b1218");
  grad.addColorStop(1, "#121a22");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const bots = msg.bots || [];
  let maxX = 800;
  let maxY = 600;
  for (const b of bots) {
    if (b.x > maxX) maxX = b.x;
    if (b.y > maxY) maxY = b.y;
  }
  maxX = Math.max(maxX + 40, 800);
  maxY = Math.max(maxY + 40, 600);
  const pad = 24;
  const s = Math.min((w - pad * 2) / maxX, (h - pad * 2) / maxY);

  // arena floor
  ctx.fillStyle = "#151e28";
  ctx.fillRect(pad, pad, maxX * s, maxY * s);
  ctx.strokeStyle = "#2a3a4a";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, maxX * s, maxY * s);

  // grid
  ctx.strokeStyle = "rgba(80,110,140,0.12)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= maxX; gx += 100) {
    ctx.beginPath();
    ctx.moveTo(pad + gx * s, pad);
    ctx.lineTo(pad + gx * s, pad + maxY * s);
    ctx.stroke();
  }
  for (let gy = 0; gy <= maxY; gy += 100) {
    ctx.beginPath();
    ctx.moveTo(pad, pad + gy * s);
    ctx.lineTo(pad + maxX * s, pad + gy * s);
    ctx.stroke();
  }

  const roster = state.playerRoster || [];
  const sorted = [...bots].sort((a, b) => (a.id || 0) - (b.id || 0));

  for (const b of sorted) {
    const idx = sorted.indexOf(b);
    const meta = roster[idx] || {};
    const color = meta.color || pickColor(b);
    const label = meta.nick || meta.botName || `#${b.id}`;
    const x = pad + (b.x || 0) * s;
    const y = pad + (maxY - (b.y || 0)) * s;

    // body
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((-(b.direction || 0)) * Math.PI) / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(0, -3, 14, 6);
    ctx.restore();

    // energy bar
    const energy = Math.max(0, Math.min(100, b.energy ?? 100));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - 14, y - 22, 28, 4);
    ctx.fillStyle = energy > 30 ? "#3dd68c" : "#ff5d5d";
    ctx.fillRect(x - 14, y - 22, 28 * (energy / 100), 4);

    // nick
    ctx.fillStyle = "#e8eef4";
    ctx.font = "600 12px IBM Plex Sans, sans-serif";
    ctx.fillText(String(label), x + 12, y - 8);
  }

  // live scoreboard
  const board = document.getElementById("scoreboard");
  if (board) {
    board.innerHTML = sorted
      .map((b, idx) => {
        const meta = roster[idx] || {};
        const color = meta.color || pickColor(b);
        const label = meta.nick || meta.botName || `#${b.id}`;
        return `<div class="sb-row"><span class="swatch" style="background:${color}"></span><span>${escapeHtml(label)}</span><span>${Math.round(b.energy ?? 0)} e</span></div>`;
      })
      .join("");
  }
}

function pickColor(b) {
  // cycle palette by id
  const palette = ["#E4572E", "#17BEBB", "#FFC914", "#2E86AB", "#A23B72", "#76B041", "#F18F01"];
  return palette[(b.id || 0) % palette.length];
}

async function renderScale() {
  app.innerHTML = `
    <div class="layout">
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <h1>Scale report</h1>
          <button class="ghost" id="home">Home</button>
        </div>
        <p class="muted">Matriz 3 → 500 · resultados em data/scale-results</p>
        <table class="scale-table">
          <thead><tr><th>N</th><th>Status</th><th>Boot ms</th><th>Wall ms</th><th>Error</th></tr></thead>
          <tbody id="rows"><tr><td colspan="5">loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("home").onclick = () => {
    history.pushState({}, "", "/");
    state.view = "home";
    render();
  };
  const data = await fetch("/api/scale/results").then((r) => r.json());
  const rows = document.getElementById("rows");
  if (!data.results?.length) {
    rows.innerHTML = `<tr><td colspan="5">Sem resultados ainda. Rode <code>bun run scale:matrix</code></td></tr>`;
    return;
  }
  rows.innerHTML = data.results
    .map(
      (r) => `<tr>
        <td>${r.n}</td>
        <td class="${r.status}">${r.status}</td>
        <td>${r.bootMs ?? "—"}</td>
        <td>${r.wallMs ?? "—"}</td>
        <td>${escapeHtml(r.error || "")}</td>
      </tr>`,
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}

// Fix static serving in dev: map /client/*
window.addEventListener("popstate", () => {
  state.view = location.pathname.startsWith("/r/")
    ? "room"
    : location.pathname.startsWith("/scale")
      ? "scale"
      : "home";
  state.code = location.pathname.startsWith("/r/")
    ? location.pathname.split("/")[2]?.toUpperCase()
    : null;
  render();
  if (state.view === "room") bootRoom();
});

render();
if (state.view === "room") bootRoom();
