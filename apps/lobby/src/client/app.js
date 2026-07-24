import { CHASSIS, drawTank, paintChassisPreview, normalizeChassis } from "./tanks.js";

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
  color: localStorage.getItem("arena.color") || "#E4572E",
  chassis: normalizeChassis(localStorage.getItem("arena.chassis") || "segfault"),
  battleWs: null,
  lastTick: null,
  playerRoster: [],
  homeSpin: 0,
  homeRaf: 0,
};

function render() {
  cancelAnimationFrame(state.homeRaf);
  if (state.view === "home") return renderHome();
  if (state.view === "scale") return renderScale();
  return renderRoom();
}

function renderHome() {
  app.innerHTML = `
    <div class="layout">
      <div class="home-hero">
        <div class="panel">
          <p class="kicker">Tank Royale · workshop lobby</p>
          <h1 class="brand">Robocode <span>Arena</span></h1>
          <p class="muted" style="margin-top:0.75rem;max-width:42ch">
            Lobby local para nick, chassis, zip multi-lang e ready.
            A partida roda na engine oficial — o canvas é só o projetor.
          </p>
          <div class="row" style="margin-top:1.25rem">
            <button id="create">Criar lobby</button>
            <button class="ghost" id="gotoScale">Scale report</button>
          </div>
          <div class="row" style="margin-top:1rem">
            <input id="joinCode" type="text" placeholder="Código" maxlength="6" style="text-transform:uppercase;width:8rem" />
            <button class="ghost" id="joinGo">Entrar</button>
          </div>
        </div>
        <div class="home-aside">
          <canvas id="homeTank" width="320" height="220"></canvas>
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
  spinHomeTank();
}

function spinHomeTank() {
  const canvas = document.getElementById("homeTank");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const tick = () => {
    state.homeSpin += 0.8;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a1016";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(61,224,255,0.2)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 48, 0, Math.PI * 2);
    ctx.stroke();
    const models = CHASSIS.map((c) => c.id);
    const id = models[Math.floor(state.homeSpin / 90) % models.length];
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((state.homeSpin * Math.PI) / 180);
    drawTank(ctx, { chassis: id, color: "#F0A202", scale: 3.2 });
    ctx.restore();
    state.homeRaf = requestAnimationFrame(tick);
  };
  tick();
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

function chassisPickerHtml(selected, color, prefix) {
  return `
    <div class="chassis-grid" id="${prefix}ChassisGrid">
      ${CHASSIS.map(
        (c) => `
        <button type="button" class="chassis-card ${c.id === selected ? "is-on" : ""}" data-chassis="${c.id}">
          <canvas width="160" height="100" data-preview="${c.id}"></canvas>
          <strong>${c.name}</strong>
          <span>${c.blurb}</span>
        </button>`,
      ).join("")}
    </div>`;
}

function paintChassisCards(root, color) {
  root?.querySelectorAll("canvas[data-preview]").forEach((cv) => {
    paintChassisPreview(cv, cv.dataset.preview, color);
  });
}

function wireChassisPicker(root, onPick) {
  root?.querySelectorAll(".chassis-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".chassis-card").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      onPick(btn.dataset.chassis);
    });
  });
}

function renderRoom() {
  const room = state.room;
  const isOwner = !!state.ownerToken;
  const me = room?.players?.find((p) => p.id === state.playerId);
  const link = `${location.origin}/r/${state.code}`;
  const myChassis = me?.chassis || state.chassis;
  const myColor = me?.color || state.color;
  const showArena =
    room?.status === "running" ||
    room?.status === "ended" ||
    room?.status === "starting";

  app.innerHTML = `
    <div class="layout">
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <p class="kicker">Sala</p>
            <h1 class="brand" style="font-size:1.8rem">${state.code || "…"}</h1>
            <p class="muted">Status: <strong class="mono">${room?.status || "loading"}</strong></p>
          </div>
          <div class="row">
            <button class="ghost" id="copy">Copiar link</button>
            ${isOwner ? `<button id="play" ${room?.canPlay ? "" : "disabled"}>Play</button>` : ""}
            ${isOwner && room?.status === "ended" ? `<button class="ghost" id="reset">Nova round</button>` : ""}
          </div>
        </div>
        <p class="muted" style="margin:0.5rem 0 0">Link: <code>${link}</code></p>
        ${room?.error ? `<p class="error">${escapeHtml(room.error)}</p>` : ""}
      </div>

      <div class="panel" id="joinPanel" style="${me ? "display:none" : ""}">
        <h2>Entrar na sala</h2>
        <div class="row">
          <input id="nick" type="text" placeholder="Nick" value="${escapeAttr(state.nick)}" />
          <input id="color" type="color" value="${state.color}" />
        </div>
        <p class="muted" style="margin:0.85rem 0 0.25rem">Chassis (visual — não muda a física)</p>
        ${chassisPickerHtml(state.chassis, state.color, "join")}
        <div class="row" style="margin-top:0.85rem">
          <button id="join">Join</button>
        </div>
      </div>

      <div class="panel" id="playerPanel" style="${me ? "" : "display:none"}">
        <h2>Seu tank</h2>
        <div class="row">
          <input id="nickEdit" type="text" value="${escapeAttr(me?.nick || state.nick)}" />
          <input id="colorEdit" type="color" value="${myColor}" />
          <button class="ghost" id="saveMeta">Salvar</button>
        </div>
        <p class="muted" style="margin:0.85rem 0 0.25rem">Chassis</p>
        ${chassisPickerHtml(myChassis, myColor, "edit")}
        <div class="row" style="margin-top:0.85rem">
          <input id="zip" type="file" accept=".zip,application/zip" />
          <button class="ghost" id="upload">Upload zip</button>
          <button id="ready" ${me?.botPath ? "" : "disabled"}>${me?.ready ? "Unready" : "Ready"}</button>
        </div>
        <p class="muted">${me?.botName ? `Bot: ${escapeHtml(me.botName)}${me.lang ? ` · ${escapeHtml(me.lang)}` : ""}` : "Zip: BotName/{BotName.json + .ts|.java|.py|.cs}"}</p>
      </div>

      <div class="panel">
        <h2>Players (${room?.players?.length || 0})</h2>
        <div id="players"></div>
      </div>

      <div id="arenaWrap" style="${showArena ? "" : "display:none"}">
        <canvas id="arena" width="1100" height="720"></canvas>
        <div class="hud" id="hud">
          <span class="pill live">LIVE</span>
          <span class="pill" id="hudText">aguardando ticks…</span>
        </div>
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
        <canvas class="player-mini" width="72" height="72" data-pchassis="${escapeAttr(p.chassis || "segfault")}" data-pcolor="${escapeAttr(p.color)}"></canvas>
        <span>${escapeHtml(p.nick)} ${p.botName ? `<span class="muted">· ${escapeHtml(p.botName)}${p.lang ? ` (${escapeHtml(p.lang)})` : ""} · ${escapeHtml(p.chassis || "segfault")}</span>` : `<span class="muted">· ${escapeHtml(p.chassis || "segfault")}</span>`}</span>
        <span class="badge ${p.ready ? "ready" : "wait"}">${p.ready ? "ready" : "waiting"}</span>
        <span class="muted">${p.id === state.playerId ? "você" : ""}</span>
      </div>`,
    )
    .join("");
  playersEl.querySelectorAll("canvas.player-mini").forEach((cv) => {
    paintChassisPreview(cv, cv.dataset.pchassis, cv.dataset.pcolor);
  });

  if (room?.results?.length) {
    document.getElementById("results").innerHTML = room.results
      .map(
        (r) =>
          `<li>#${r.rank} <strong>${escapeHtml(r.name)}</strong> — ${r.totalScore} pts</li>`,
      )
      .join("");
  }

  paintChassisCards(document.getElementById("joinChassisGrid"), state.color);
  paintChassisCards(document.getElementById("editChassisGrid"), myColor);
  wireChassisPicker(document.getElementById("joinChassisGrid"), (id) => {
    state.chassis = id;
    localStorage.setItem("arena.chassis", id);
    paintChassisCards(document.getElementById("joinChassisGrid"), state.color);
  });
  wireChassisPicker(document.getElementById("editChassisGrid"), (id) => {
    state.chassis = id;
    localStorage.setItem("arena.chassis", id);
    saveMeta();
  });

  document.getElementById("color")?.addEventListener("input", (e) => {
    state.color = e.target.value;
    paintChassisCards(document.getElementById("joinChassisGrid"), state.color);
  });
  document.getElementById("colorEdit")?.addEventListener("input", (e) => {
    paintChassisCards(document.getElementById("editChassisGrid"), e.target.value);
  });

  document.getElementById("copy")?.addEventListener("click", () => navigator.clipboard.writeText(link));
  document.getElementById("join")?.addEventListener("click", joinRoom);
  document.getElementById("saveMeta")?.addEventListener("click", saveMeta);
  document.getElementById("upload")?.addEventListener("click", uploadZip);
  document.getElementById("ready")?.addEventListener("click", toggleReady);
  document.getElementById("play")?.addEventListener("click", play);
  document.getElementById("reset")?.addEventListener("click", resetRoom);

  state.playerRoster = (room?.players || []).map((p) => ({
    nick: p.nick,
    color: p.color,
    chassis: p.chassis || "segfault",
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
  const res = await fetch(`/api/rooms/${state.code}`);
  if (res.ok) {
    state.room = (await res.json()).room;
    renderRoom();
  }
}

async function joinRoom() {
  const nick = document.getElementById("nick").value.trim();
  const color = document.getElementById("color").value;
  const chassis =
    document.querySelector("#joinChassisGrid .chassis-card.is-on")?.dataset.chassis ||
    state.chassis;
  state.nick = nick;
  state.color = color;
  state.chassis = chassis;
  localStorage.setItem("arena.nick", nick);
  localStorage.setItem("arena.color", color);
  localStorage.setItem("arena.chassis", chassis);
  const res = await fetch(`/api/rooms/${state.code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick, color, chassis }),
  }).then((r) => r.json());
  if (res.error) return alert(res.error);
  state.playerId = res.player.id;
  localStorage.setItem("arena.playerId", res.player.id);
  state.room = res.room;
  renderRoom();
}

async function saveMeta() {
  const nick = document.getElementById("nickEdit")?.value.trim() || state.nick;
  const color = document.getElementById("colorEdit")?.value || state.color;
  const chassis =
    document.querySelector("#editChassisGrid .chassis-card.is-on")?.dataset.chassis ||
    state.chassis;
  state.nick = nick;
  state.color = color;
  state.chassis = chassis;
  localStorage.setItem("arena.nick", nick);
  localStorage.setItem("arena.color", color);
  localStorage.setItem("arena.chassis", chassis);
  await fetch(`/api/rooms/${state.code}/players/${state.playerId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick, color, chassis }),
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
  // Prefer same-origin path (works behind Railway TLS); fall back to absolute wsUrl.
  const wsUrl =
    info.path != null
      ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${info.path}`
      : info.wsUrl;
  const ws = new WebSocket(wsUrl);
  state.battleWs = ws;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "tick") {
      state.lastTick = msg;
      drawArena(msg);
      const hud = document.getElementById("hudText");
      if (hud) hud.textContent = `R${msg.round} · T${msg.turn} · ${msg.bots?.length || 0} bots`;
    }
  };
}

function drawArena(msg) {
  const canvas = document.getElementById("arena");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, w * 0.7);
  grad.addColorStop(0, "#121a24");
  grad.addColorStop(1, "#070b10");
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
  const pad = 28;
  const s = Math.min((w - pad * 2) / maxX, (h - pad * 2) / maxY);
  const aw = maxX * s;
  const ah = maxY * s;

  // arena floor
  ctx.fillStyle = "#0c1218";
  ctx.fillRect(pad, pad, aw, ah);
  ctx.strokeStyle = "rgba(61,224,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, aw, ah);

  // grid
  ctx.strokeStyle = "rgba(80,110,140,0.14)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= maxX; gx += 100) {
    ctx.beginPath();
    ctx.moveTo(pad + gx * s, pad);
    ctx.lineTo(pad + gx * s, pad + ah);
    ctx.stroke();
  }
  for (let gy = 0; gy <= maxY; gy += 100) {
    ctx.beginPath();
    ctx.moveTo(pad, pad + gy * s);
    ctx.lineTo(pad + aw, pad + gy * s);
    ctx.stroke();
  }

  const roster = state.playerRoster || [];
  const sorted = [...bots].sort((a, b) => (a.id || 0) - (b.id || 0));
  const tankScale = Math.max(0.9, Math.min(1.6, s * 1.1));

  for (const b of sorted) {
    const idx = sorted.indexOf(b);
    const meta = roster[idx] || {};
    const color = meta.color || pickColor(b);
    const chassis = meta.chassis || "segfault";
    const label = meta.nick || meta.botName || `#${b.id}`;
    const x = pad + (b.x || 0) * s;
    const y = pad + (maxY - (b.y || 0)) * s;

    // scan arc hint
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((-(b.direction || 0)) * Math.PI) / 180);
    ctx.strokeStyle = "rgba(61,224,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 28 * tankScale, -0.55, 0.55);
    ctx.closePath();
    ctx.stroke();
    drawTank(ctx, { chassis, color, scale: 1.15 * tankScale, energy: b.energy });
    ctx.restore();

    const energy = Math.max(0, Math.min(100, b.energy ?? 100));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 16, y - 28, 32, 4);
    ctx.fillStyle = energy > 30 ? "#3dd68c" : "#ff5d5d";
    ctx.fillRect(x - 16, y - 28, 32 * (energy / 100), 4);

    ctx.fillStyle = "#e7eef6";
    ctx.font = "600 12px Oxanium, sans-serif";
    ctx.fillText(String(label), x + 14, y - 10);
  }

  const board = document.getElementById("scoreboard");
  if (board) {
    board.innerHTML = sorted
      .map((b, idx) => {
        const meta = roster[idx] || {};
        const color = meta.color || pickColor(b);
        const label = meta.nick || meta.botName || `#${b.id}`;
        const id = `sb-${b.id}`;
        return `<div class="sb-row"><canvas class="sb-tank" id="${id}" width="52" height="40"></canvas><span>${escapeHtml(label)}</span><span>${Math.round(b.energy ?? 0)}</span></div>`;
      })
      .join("");
    sorted.forEach((b, idx) => {
      const meta = roster[idx] || {};
      const cv = document.getElementById(`sb-${b.id}`);
      if (cv)
        paintChassisPreview(
          cv,
          meta.chassis || "segfault",
          meta.color || pickColor(b),
        );
    });
  }
}

function pickColor(b) {
  const palette = ["#E4572E", "#17BEBB", "#FFC914", "#2E86AB", "#A23B72", "#76B041", "#F18F01"];
  return palette[(b.id || 0) % palette.length];
}

async function renderScale() {
  app.innerHTML = `
    <div class="layout">
      <div class="panel">
        <div class="row" style="justify-content:space-between">
          <div>
            <p class="kicker">Ops</p>
            <h1>Scale report</h1>
          </div>
          <button class="ghost" id="home">Home</button>
        </div>
        <p class="muted">Matriz 3 → 500 · data/scale-results</p>
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
    rows.innerHTML = `<tr><td colspan="5">Sem resultados. Rode <code>bun scripts/scale/run-matrix.ts</code></td></tr>`;
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
