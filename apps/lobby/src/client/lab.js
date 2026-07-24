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
  exampleId: "starter",
  examples: [],
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
      botName: el("botName").value.trim() || "Starter",
      source: state.editor.getValue(),
      difficulty: el("difficulty").value,
      exampleId: state.exampleId,
    }),
  );
}

function showErr(msg) {
  const p = el("labError");
  if (!msg) {
    p.hidden = true;
    p.textContent = "";
    return;
  }
  p.hidden = false;
  p.textContent = msg;
}

function setStatus(hud, status) {
  el("hudText").textContent = hud;
  if (status != null) el("hudStatus").textContent = status;
}

async function loadMonaco() {
  if (window.monaco?.editor?.create) return window.monaco;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/vs/loader.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Monaco loader"));
    document.head.appendChild(s);
  });
  if (!window.require) throw new Error("Monaco AMD require missing");
  window.require.config({
    paths: {
      vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/vs`,
    },
  });
  // Cross-origin workers need a blob/data bootstrap (CDN worker URLs alone fail).
  window.MonacoEnvironment = {
    getWorkerUrl() {
      const base = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VER}/min/`;
      return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: '${base}' };
        importScripts('${base}vs/base/worker/workerMain.js');
      `)}`;
    },
  };
  await new Promise((resolve, reject) => {
    window.require(["vs/editor/editor.main"], () => resolve(), reject);
  });
  if (!window.monaco?.editor?.create) {
    throw new Error("Monaco editor.main loaded without monaco.editor");
  }
  return window.monaco;
}

async function fetchExamples() {
  const r = await fetch("/api/lab/examples");
  if (!r.ok) throw new Error("failed to load examples");
  const data = await r.json();
  return data.examples || [];
}

async function fetchExample(id, lang) {
  const r = await fetch(`/api/lab/examples/${id}?lang=${lang}`);
  if (!r.ok) throw new Error((await r.json()).error || "example failed");
  return r.json();
}

function fillExampleSelect() {
  const sel = el("example");
  sel.innerHTML = "";
  for (const ex of state.examples) {
    const opt = document.createElement("option");
    opt.value = ex.id;
    opt.textContent = ex.title;
    sel.appendChild(opt);
  }
  sel.value = state.exampleId;
}

function setBlurb(text) {
  const b = el("exampleBlurb");
  if (b) b.textContent = text || "";
}

async function loadPlaystyle(id, { force = false } = {}) {
  if (!force && state.dirty) {
    const ok = confirm("Descartar mudanças e carregar este playstyle?");
    if (!ok) {
      el("example").value = state.exampleId;
      return;
    }
  }
  state.exampleId = id;
  el("example").value = id;
  const ex = await fetchExample(id, state.lang);
  el("botName").value = ex.botName;
  setBlurb(ex.blurb);
  if (state.editor) {
    window.monaco.editor.setModelLanguage(
      state.editor.getModel(),
      MONACO_LANG[state.lang],
    );
    state.editor.setValue(ex.source);
  }
  state.dirty = false;
  state.fileHandle = null;
  saveDraft();
}

async function setLang(lang, { force = false } = {}) {
  if (!force && state.dirty) {
    const ok = confirm("Descartar mudanças e trocar de linguagem?");
    if (!ok) {
      el("lang").value = state.lang;
      return;
    }
  }
  state.lang = lang;
  el("lang").value = lang;

  const draft = loadDraft(lang);
  if (draft?.source && !force) {
    if (draft.exampleId) state.exampleId = draft.exampleId;
    el("example").value = state.exampleId;
    el("botName").value = draft.botName || "Starter";
    if (draft.difficulty) el("difficulty").value = draft.difficulty;
    const meta = state.examples.find((e) => e.id === state.exampleId);
    setBlurb(meta?.blurb || "");
    if (state.editor) {
      window.monaco.editor.setModelLanguage(
        state.editor.getModel(),
        MONACO_LANG[lang],
      );
      state.editor.setValue(draft.source);
    }
    state.dirty = false;
    return;
  }

  await loadPlaystyle(state.exampleId || "starter", { force: true });
}

function drawArena(msg) {
  const canvas = el("arena");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createRadialGradient(
    w * 0.5,
    h * 0.45,
    40,
    w * 0.5,
    h * 0.5,
    w * 0.7,
  );
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
    const color =
      i === 0 ? PLAYER_COLOR : oppColors[(i - 1) % oppColors.length];
    const chassis = i === 0 ? "segfault" : i % 2 === 0 ? "docker" : "techdebt";
    const x = pad + (b.x || 0) * s;
    const y = pad + (maxY - (b.y || 0)) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((-(b.direction || 0)) * Math.PI) / 180);
    drawTank(ctx, {
      chassis,
      color,
      scale: 1.15 * tankScale,
      energy: b.energy,
    });
    ctx.restore();
    const energy = Math.max(0, Math.min(100, b.energy ?? 100));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 16, y - 28, 32, 4);
    ctx.fillStyle = energy > 30 ? "#3dd68c" : "#ff5d5d";
    ctx.fillRect(x - 16, y - 28, 32 * (energy / 100), 4);
    ctx.fillStyle = "#e7eef6";
    ctx.font = "600 12px Oxanium, sans-serif";
    ctx.fillText(
      i === 0 ? el("botName").value || "You" : `Opp${i}`,
      x + 14,
      y - 10,
    );
  }
}

async function connectBattle(battleId) {
  if (state.battleWs) state.battleWs.close();
  const info = await fetch(`/api/battles/${battleId}/proxy-ws-info`).then((r) =>
    r.json(),
  );
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
      setStatus(
        `R${msg.round} · T${msg.turn} · ${msg.bots?.length || 0} bots`,
        null,
      );
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
      el("hudStatus").textContent = st;
      if (st === "ENDED" || st === "FAILED" || st === "STOPPED") {
        stopPoll();
        state.deploying = false;
        el("btnDeploy").disabled = false;
        if (st === "FAILED") showErr(snap.error || "Battle FAILED");
        if (snap.results?.length) {
          const box = el("labResults");
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
  el("labResults").hidden = true;
  const botName = el("botName").value.trim() || "Starter";
  const body = {
    lang: state.lang,
    botName,
    source: state.editor.getValue(),
    difficulty: el("difficulty").value,
  };
  state.deploying = true;
  el("btnDeploy").disabled = true;
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
    setStatus("booting", "BOOTING");
    await connectBattle(data.battleId);
    startPoll(data.battleId);
  } catch (e) {
    showErr(e instanceof Error ? e.message : String(e));
    state.deploying = false;
    el("btnDeploy").disabled = false;
    setStatus("idle", "");
  }
}

async function openFile() {
  if (!window.showOpenFilePicker) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Bot source",
          accept: { "text/plain": [".ts", ".java", ".py"] },
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
      window.monaco.editor.setModelLanguage(
        state.editor.getModel(),
        MONACO_LANG[lang],
      );
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
    const suggested = `${el("botName").value.trim() || "Starter"}${ext}`;
    const handle =
      state.fileHandle ||
      (await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [
          {
            description: `${state.lang} bot`,
            accept: { "text/plain": [ext] },
          },
        ],
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
  state.examples = await fetchExamples();
  fillExampleSelect();

  const monacoApi = await loadMonaco();
  if (!monacoApi?.editor?.create) {
    throw new Error("Monaco editor failed to load");
  }
  state.editor = monacoApi.editor.create(el("monaco"), {
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

  if (window.showOpenFilePicker) el("btnOpen").hidden = false;
  if (window.showSaveFilePicker) el("btnSave").hidden = false;

  el("lang").onchange = () => setLang(el("lang").value);
  el("example").onchange = () => loadPlaystyle(el("example").value);
  el("difficulty").onchange = () => saveDraft();
  el("botName").onchange = () => saveDraft();
  el("btnDeploy").onclick = () => deploy();
  el("btnOpen").onclick = () => openFile();
  el("btnSave").onclick = () => saveFile();

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

  const draft = loadDraft("ts");
  if (draft?.exampleId) state.exampleId = draft.exampleId;
  await setLang("ts", { force: true });
  setStatus("idle", "");
}

boot().catch((e) => showErr(e instanceof Error ? e.message : String(e)));
