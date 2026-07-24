import { drawTank } from "./tanks.js";

const MONACO_VER = "0.52.2";
const EXT = { ts: ".ts", java: ".java", python: ".py" };
const MONACO_LANG = { ts: "typescript", java: "java", python: "python" };
const DIFF_COLORS = {
  easy: ["#3dd68c", "#2bb673", "#1f9a5c"],
  medium: ["#f5c542", "#e0a820", "#c99210"],
  hard: ["#ff5d5d", "#e04545", "#c23030"],
};
const PLAYER_COLOR = "#3de0ff";

const state = {
  editor: null,
  lang: "ts",
  difficulty: "medium",
  botName: "LabBot",
  dirty: false,
  deploying: false,
  battleWs: null,
  battleId: null,
  pollTimer: null,
  fileHandle: null,
};

const el = (id) => document.getElementById(id);

function draftKey(lang) {
  return `lab:draft:${lang}`;
}

function loadDraft(lang) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(lang)) || "null");
  } catch {
    return null;
  }
}

function saveDraft() {
  if (!state.editor) return;
  localStorage.setItem(
    draftKey(state.lang),
    JSON.stringify({
      botName: el("botName").value.trim() || "LabBot",
      source: state.editor.getValue(),
      difficulty: el("difficulty").value,
    }),
  );
}

function showErr(msg) {
  const p = el("errPanel");
  if (!msg) {
    p.hidden = true;
    p.textContent = "";
    return;
  }
  p.hidden = false;
  p.textContent = msg;
}

function setStatus(hud, battle) {
  el("hudText").textContent = hud;
  el("battleStatus").textContent = battle || "";
}

async function loadMonaco() {
  if (window.monaco) return window.monaco;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/vs/loader.js`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.require.config({
    paths: {
      vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/vs`,
    },
  });
  return new Promise((resolve) => {
    window.require(["vs/editor/editor.main"], () => resolve(window.monaco));
  });
}

async function fetchTemplate(lang) {
  const r = await fetch(`/api/lab/templates/${lang}`);
  if (!r.ok) throw new Error((await r.json()).error || "template failed");
  return r.json();
}

async function setLang(lang, { force = false } = {}) {
  if (!force && state.dirty) {
    const ok = confirm("Descartar mudanças e carregar template da nova lang?");
    if (!ok) {
      el("lang").value = state.lang;
      return;
    }
  }
  state.lang = lang;
  el("lang").value = lang;
  const draft = loadDraft(lang);
  let source;
  let botName = "LabBot";
  if (draft?.source) {
    source = draft.source;
    botName = draft.botName || "LabBot";
    if (draft.difficulty) el("difficulty").value = draft.difficulty;
  } else {
    const t = await fetchTemplate(lang);
    source = t.source;
    botName = t.botName;
  }
  el("botName").value = botName;
  state.botName = botName;
    if (state.editor) {
      const model = state.editor.getModel();
      window.monaco.editor.setModelLanguage(model, MONACO_LANG[lang]);
      state.editor.setValue(source);
    }
  state.dirty = false;
  state.fileHandle = null;
  saveDraft();
}

function drawArena(msg) {
  const canvas = el("arena");
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

  ctx.fillStyle = "#0c1218";
  ctx.fillRect(pad, pad, aw, ah);
  ctx.strokeStyle = "rgba(61,224,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, aw, ah);

  const sorted = [...bots].sort((a, b) => (a.id || 0) - (b.id || 0));
  const diff = el("difficulty").value;
  const oppColors = DIFF_COLORS[diff] || DIFF_COLORS.medium;
  const tankScale = Math.max(0.9, Math.min(1.6, s * 1.1));

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const color = i === 0 ? PLAYER_COLOR : oppColors[(i - 1) % oppColors.length];
    const chassis = i === 0 ? "segfault" : i % 2 === 0 ? "docker" : "techdebt";
    const x = pad + (b.x || 0) * s;
    const y = pad + (maxY - (b.y || 0)) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((-(b.direction || 0)) * Math.PI) / 180);
    drawTank(ctx, { chassis, color, scale: 1.15 * tankScale, energy: b.energy });
    ctx.restore();
    const energy = Math.max(0, Math.min(100, b.energy ?? 100));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 16, y - 28, 32, 4);
    ctx.fillStyle = energy > 30 ? "#3dd68c" : "#ff5d5d";
    ctx.fillRect(x - 16, y - 28, 32 * (energy / 100), 4);
    ctx.fillStyle = "#e7eef6";
    ctx.font = "600 12px Oxanium, sans-serif";
    ctx.fillText(i === 0 ? el("botName").value || "You" : `Opp${i}`, x + 14, y - 10);
  }
}

async function connectBattle(battleId) {
  if (state.battleWs) state.battleWs.close();
  const info = await fetch(`/api/battles/${battleId}/proxy-ws-info`).then((r) => r.json());
  const wsUrl =
    info.path != null
      ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${info.path}`
      : info.wsUrl;
  const ws = new WebSocket(wsUrl);
  state.battleWs = ws;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "tick") {
      drawArena(msg);
      setStatus(`R${msg.round} · T${msg.turn} · ${msg.bots?.length || 0} bots`, state.battleId);
    }
  };
}

function stopPoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startPoll(battleId) {
  stopPoll();
  state.pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`/api/lab/battles/${battleId}`);
      if (!r.ok) return;
      const snap = await r.json();
      const st = snap.status || "";
      el("battleStatus").textContent = st;
      if (st === "ENDED" || st === "FAILED" || st === "STOPPED") {
        stopPoll();
        state.deploying = false;
        el("deploy").disabled = false;
        if (st === "FAILED") {
          showErr(snap.error || "Battle FAILED");
        }
        if (snap.results?.length) {
          const box = el("results");
          box.hidden = false;
          box.textContent = snap.results
            .map(
              (row, i) =>
                `#${row.rank ?? i + 1} ${row.name}  score=${row.totalScore ?? "?"}  surv=${row.survival ?? "?"}`,
            )
            .join("\n");
        }
        setStatus(st === "ENDED" ? "ended" : st.toLowerCase(), battleId);
      }
    } catch {
      /* ignore */
    }
  }, 1500);
}

async function deploy() {
  if (state.deploying || !state.editor) return;
  showErr("");
  el("results").hidden = true;
  const botName = el("botName").value.trim() || "LabBot";
  const body = {
    lang: state.lang,
    botName,
    source: state.editor.getValue(),
    difficulty: el("difficulty").value,
  };
  state.deploying = true;
  el("deploy").disabled = true;
  setStatus("deploying…", "");
  saveDraft();
  try {
    const r = await fetch("/api/lab/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    state.battleId = data.battleId;
    setStatus("booting", data.battleId);
    await connectBattle(data.battleId);
    startPoll(data.battleId);
  } catch (e) {
    showErr(e instanceof Error ? e.message : String(e));
    state.deploying = false;
    el("deploy").disabled = false;
    setStatus("idle", "");
  }
}

function acceptForLang(lang) {
  const ext = EXT[lang];
  return [
    {
      description: `${lang} bot`,
      accept: {
        "text/plain": [ext],
      },
    },
  ];
}

async function openFile() {
  if (!window.showOpenFilePicker) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Bot source",
          accept: {
            "text/plain": [".ts", ".java", ".py"],
          },
        },
      ],
    });
    const file = await handle.getFile();
    const text = await file.text();
    const name = file.name.toLowerCase();
    let lang = state.lang;
    if (name.endsWith(".ts")) lang = "ts";
    else if (name.endsWith(".java")) lang = "java";
    else if (name.endsWith(".py")) lang = "python";
    state.fileHandle = handle;
    el("lang").value = lang;
    state.lang = lang;
    const base = file.name.replace(/\.(ts|java|py)$/i, "");
    if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(base)) {
      el("botName").value = base;
    }
    if (state.editor) {
      window.monaco.editor.setModelLanguage(state.editor.getModel(), MONACO_LANG[lang]);
      state.editor.setValue(text);
    }
    state.dirty = true;
    saveDraft();
  } catch (e) {
    if (e?.name === "AbortError") return;
    showErr(e instanceof Error ? e.message : String(e));
  }
}

async function saveFile() {
  if (!window.showSaveFilePicker || !state.editor) return;
  try {
    const ext = EXT[state.lang];
    const suggested = `${el("botName").value.trim() || "LabBot"}${ext}`;
    const handle =
      state.fileHandle ||
      (await window.showSaveFilePicker({
        suggestedName: suggested,
        types: acceptForLang(state.lang),
      }));
    state.fileHandle = handle;
    const writable = await handle.createWritable();
    await writable.write(state.editor.getValue());
    await writable.close();
    state.dirty = false;
    saveDraft();
  } catch (e) {
    if (e?.name === "AbortError") return;
    showErr(e instanceof Error ? e.message : String(e));
  }
}

async function boot() {
  const monaco = await loadMonaco();
  state.editor = monaco.editor.create(el("editor"), {
    value: "",
    language: "typescript",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: "JetBrains Mono, Menlo, monospace",
    fontSize: 13,
    scrollBeyondLastLine: false,
  });
  state.editor.onDidChangeModelContent(() => {
    state.dirty = true;
    saveDraft();
  });

  if (window.showOpenFilePicker) el("openFile").hidden = false;
  if (window.showSaveFilePicker) el("saveFile").hidden = false;

  el("lang").onchange = () => setLang(el("lang").value);
  el("difficulty").onchange = () => {
    state.difficulty = el("difficulty").value;
    saveDraft();
  };
  el("botName").onchange = () => saveDraft();
  el("deploy").onclick = () => deploy();
  el("openFile").onclick = () => openFile();
  el("saveFile").onclick = () => saveFile();

  window.addEventListener("keydown", (ev) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key === "Enter") {
      ev.preventDefault();
      deploy();
    }
    if (mod && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      saveFile();
    }
  });

  await setLang(el("lang").value, { force: true });
  setStatus("idle", "");
}

boot().catch((e) => showErr(e instanceof Error ? e.message : String(e)));
