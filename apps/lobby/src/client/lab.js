import { drawTank } from "./tanks.js";
import {
  drawBullets,
  drawBotSensors,
  playBattleIntro,
  lerpTicks,
  easeInOut,
} from "./arena-fx.js";

const MONACO_VER = "0.52.2";
const EXT = { ts: ".ts", java: ".java", python: ".py" };
const MONACO_LANG = { ts: "typescript", java: "java", python: "python" };
const DIFF_COLORS = {
  easy: ["#3dd68c", "#2bb673", "#1f9a5c"],
  medium: ["#f5c542", "#e0a820", "#c99210"],
  hard: ["#ff5d5d", "#e04545", "#c23030"],
};
const PLAYER_COLOR = "#3de0ff";
const LIBRARY_MAX = 20;
/** Keyframe spacing — rAF interpolates between ticks for fluid motion. */
const PACE_MS = { cinema: 220, watch: 140, normal: 55 };

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
  introForBattle: null,
  introHandle: null,
  introActive: false,
  pendingTick: null,
  pendingResults: null,
  tickQueue: [],
  playbackTimer: null,
  playbackRaf: 0,
  playbackMs: 220,
  playFrom: null,
  playTo: null,
  playStart: 0,
  cancelIntro: null,
  draftBadgeTimer: 0,
};

const el = (id) => document.getElementById(id);

function draftKey(lang) {
  return `lab:draft:${lang}`;
}

function libraryKey(lang) {
  return `lab:library:${lang}`;
}

function loadDraft(lang) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(lang)) || "null");
  } catch {
    return null;
  }
}

function setDraftBadge(text, isDirty) {
  const b = el("draftBadge");
  if (!b) return;
  b.textContent = text;
  b.classList.toggle("is-dirty", !!isDirty);
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
      pace: el("pace")?.value || "cinema",
      updatedAt: Date.now(),
    }),
  );
  clearTimeout(state.draftBadgeTimer);
  state.draftBadgeTimer = window.setTimeout(() => {
    setDraftBadge(state.dirty ? "autosave ✓" : "salvo", state.dirty);
  }, 250);
}

function loadLibrary(lang) {
  try {
    const list = JSON.parse(localStorage.getItem(libraryKey(lang)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistLibrary(lang, list) {
  localStorage.setItem(libraryKey(lang), JSON.stringify(list.slice(0, LIBRARY_MAX)));
}

function refreshLibrarySelect() {
  const sel = el("librarySelect");
  if (!sel) return;
  const prev = sel.value;
  const list = loadLibrary(state.lang);
  sel.innerHTML = `<option value="">— autosave atual —</option>`;
  for (const item of list) {
    const opt = document.createElement("option");
    opt.value = item.id;
    const when = item.savedAt
      ? new Date(item.savedAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    opt.textContent = `${item.name}${when ? ` · ${when}` : ""}`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  syncLibraryButtons();
}

function syncLibraryButtons() {
  const id = el("librarySelect")?.value || "";
  const has = !!id;
  const loadBtn = el("btnLoadDraft");
  const delBtn = el("btnDeleteDraft");
  if (loadBtn) loadBtn.disabled = !has;
  if (delBtn) delBtn.disabled = !has;
}

function saveNamedDraft() {
  if (!state.editor) return;
  const suggested = el("botName").value.trim() || "MeuBot";
  const name = prompt("Nome do rascunho:", suggested);
  if (!name?.trim()) return;
  const list = loadLibrary(state.lang).filter(
    (d) => d.name.toLowerCase() !== name.trim().toLowerCase(),
  );
  list.unshift({
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 48),
    botName: el("botName").value.trim() || "Starter",
    source: state.editor.getValue(),
    exampleId: state.exampleId,
    difficulty: el("difficulty").value,
    savedAt: Date.now(),
  });
  persistLibrary(state.lang, list);
  refreshLibrarySelect();
  el("librarySelect").value = list[0].id;
  syncLibraryButtons();
  setDraftBadge("biblioteca ✓", false);
  showErr("");
}

function loadNamedDraft() {
  const id = el("librarySelect")?.value;
  if (!id || !state.editor) return;
  const item = loadLibrary(state.lang).find((d) => d.id === id);
  if (!item) return;
  if (state.dirty) {
    const ok = confirm("Descartar mudanças não tipadas no playstyle e carregar rascunho?");
    if (!ok) return;
  }
  el("botName").value = item.botName || "Starter";
  if (item.difficulty) el("difficulty").value = item.difficulty;
  if (item.exampleId) {
    state.exampleId = item.exampleId;
    el("example").value = item.exampleId;
    const meta = state.examples.find((e) => e.id === item.exampleId);
    if (meta) setPlaystyleInfo(meta);
  }
  state.editor.setValue(item.source || "");
  state.dirty = false;
  saveDraft();
  setDraftBadge("carregado", false);
}

function deleteNamedDraft() {
  const id = el("librarySelect")?.value;
  if (!id) return;
  const list = loadLibrary(state.lang);
  const item = list.find((d) => d.id === id);
  if (!item) return;
  if (!confirm(`Apagar rascunho “${item.name}”?`)) return;
  persistLibrary(
    state.lang,
    list.filter((d) => d.id !== id),
  );
  refreshLibrarySelect();
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
    opt.title = ex.blurb || "";
    sel.appendChild(opt);
  }
  sel.value = state.exampleId;
}

function setPlaystyleInfo(meta) {
  const card = el("playstyleCard");
  const title = el("playstyleTitle");
  const blurb = el("exampleBlurb");
  const tactics = el("playstyleTactics");
  if (!card || !title || !blurb) return;
  if (!meta?.title && !meta?.blurb) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  title.textContent = meta.title || meta.botName || "";
  blurb.textContent = meta.blurb || "";
  if (tactics) {
    tactics.innerHTML = (meta.tactics || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
  }
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
  setPlaystyleInfo(ex);
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
    if (draft.pace && el("pace")) el("pace").value = draft.pace;
    const meta = state.examples.find((e) => e.id === state.exampleId);
    setPlaystyleInfo(meta || {});
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
  const tankScale = Math.max(1.35, Math.min(2.2, s * 2.4));
  const map = { pad, s, maxY };

  // sensors under tanks
  for (let i = 0; i < sorted.length; i++) {
    drawBotSensors(ctx, sorted[i], map, { emphasize: i === 0 });
  }

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

  drawBullets(ctx, msg.bullets, map);
}

function maybePlayIntro(msg) {
  if (msg.type === "game_started" && state.introHandle?.skipToGo) {
    state.introHandle.skipToGo();
  }
}

function stopPlayback() {
  if (state.playbackTimer != null) {
    clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }
  if (state.playbackRaf) {
    cancelAnimationFrame(state.playbackRaf);
    state.playbackRaf = 0;
  }
  state.tickQueue = [];
  state.playFrom = null;
  state.playTo = null;
  state.pendingResults = null;
}

function paintTick(msg) {
  drawArena(msg);
  updateLiveBoard(msg);
  const nBullets = msg.bullets?.length || 0;
  setStatus(
    `R${msg.round} · T${msg.turn} · ${msg.bots?.length || 0} bots${nBullets ? ` · ${nBullets} ✦` : ""}`,
    null,
  );
}

function finishPlaybackIfIdle() {
  if (state.tickQueue.length || state.playTo) return;
  if (!state.pendingResults) return;
  const results = state.pendingResults;
  state.pendingResults = null;
  showResults(results);
  state.deploying = false;
  el("btnDeploy").disabled = false;
}

function ensurePlaybackLoop() {
  if (state.playbackRaf) return;
  const loop = (now) => {
    state.playbackRaf = requestAnimationFrame(loop);
    if (state.introActive) return;

    if (!state.playTo) {
      if (!state.tickQueue.length) {
        finishPlaybackIfIdle();
        return;
      }
      state.playFrom = state.playFrom || state.tickQueue.shift();
      state.playTo = state.tickQueue.shift() || state.playFrom;
      state.playStart = now;
    }

    const dur = Math.max(40, state.playbackMs);
    let u = (now - state.playStart) / dur;
    if (u >= 1) {
      paintTick(state.playTo);
      state.playFrom = state.playTo;
      if (state.tickQueue.length) {
        state.playTo = state.tickQueue.shift();
        state.playStart = now;
      } else {
        state.playTo = null;
        finishPlaybackIfIdle();
      }
      return;
    }
    paintTick(lerpTicks(state.playFrom, state.playTo, easeInOut(u)));
  };
  state.playbackRaf = requestAnimationFrame(loop);
}

function kickPlayback() {
  ensurePlaybackLoop();
}

function enqueueTick(msg) {
  state.tickQueue.push(msg);
  if (state.tickQueue.length > 2500) {
    state.tickQueue = state.tickQueue.filter((_, i) => i % 2 === 1);
  }
  kickPlayback();
}

async function connectBattle(battleId) {
  if (state.battleWs) state.battleWs.close();
  state.battleId = battleId;
  stopPlayback();
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
    maybePlayIntro(msg);
    if (msg.type === "tick") {
      if (!msg.bots?.length) return;
      enqueueTick(msg);
    }
    if (msg.type === "snapshot" && msg.status === "BOOTING") {
      setStatus("booting…", "BOOTING");
    }
  };
}

function botLabel(index) {
  if (index === 0) return el("botName").value.trim() || "Você";
  return `Opp${index}`;
}

function updateLiveBoard(msg) {
  const board = el("labLiveBoard");
  if (!board) return;
  const bots = [...(msg.bots || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  if (!bots.length) {
    board.hidden = true;
    return;
  }
  board.hidden = false;
  board.innerHTML = bots
    .map((b, i) => {
      const energy = Math.max(0, Math.round(b.energy ?? 0));
      const you = i === 0 ? " is-you" : "";
      return `<div class="lab-live-row${you}"><span>${escapeHtml(botLabel(i))}</span><span>${energy} hp</span></div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clearResultsUi() {
  const panel = el("labResultsPanel");
  const winner = el("labWinner");
  const live = el("labLiveBoard");
  if (panel) panel.hidden = true;
  if (winner) {
    winner.hidden = true;
    winner.innerHTML = "";
  }
  if (live) {
    live.hidden = true;
    live.innerHTML = "";
  }
  const list = el("labResults");
  if (list) list.innerHTML = "";
}

function showResults(results) {
  const panel = el("labResultsPanel");
  const list = el("labResults");
  const sub = el("labResultsSub");
  const winner = el("labWinner");
  if (!panel || !list || !results?.length) return;

  const ranked = [...results].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  );
  const top = ranked[0];
  const youName = el("botName").value.trim() || "Starter";

  list.innerHTML = ranked
    .map((row, i) => {
      const rank = row.rank ?? i + 1;
      const isWin = rank === 1;
      const isYou =
        String(row.name || "").toLowerCase() === youName.toLowerCase();
      const label = isYou ? `${row.name} (você)` : row.name;
      return `<li class="${isWin ? "is-winner" : ""}">
        <span class="rank">#${rank}</span>
        <span>${escapeHtml(label)}</span>
        <span>${row.totalScore ?? "?"} pts</span>
      </li>`;
    })
    .join("");

  if (sub) {
    sub.textContent = top
      ? `Vencedor: ${top.name} · ${top.totalScore ?? "?"} pts`
      : "";
  }

  if (winner && top) {
    winner.hidden = false;
    winner.innerHTML = `
      <div>
        <div class="lab-winner-kicker">Vencedor</div>
        <strong>${escapeHtml(top.name)}</strong>
        <div class="lab-winner-score">${top.totalScore ?? "?"} pts · survival ${top.survival ?? "?"}</div>
      </div>`;
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        el("hudStatus").textContent = st;
        if (st === "FAILED") {
          showErr(snap.error || "Battle FAILED");
          state.deploying = false;
          el("btnDeploy").disabled = false;
          setStatus("failed", st);
          return;
        }
        if (snap.results?.length) {
          // Wait for cinema playback queue to drain before placar.
          state.pendingResults = snap.results;
          kickPlayback();
          if (!state.tickQueue.length && !state.introActive) {
            showResults(snap.results);
            state.pendingResults = null;
            state.deploying = false;
            el("btnDeploy").disabled = false;
          }
        } else {
          state.deploying = false;
          el("btnDeploy").disabled = false;
        }
        setStatus(st === "ENDED" ? "ended" : st.toLowerCase(), st);
      }
    } catch {
      /* ignore */
    }
  }, 1500);
}

async function deploy() {
  if (state.deploying || !state.editor) return;
  showErr("");
  clearResultsUi();
  const botName = el("botName").value.trim() || "Starter";
  const body = {
    lang: state.lang,
    botName,
    source: state.editor.getValue(),
    difficulty: el("difficulty").value,
    pace: el("pace")?.value || "cinema",
  };
  state.deploying = true;
  el("btnDeploy").disabled = true;
  setStatus("deploying…", "");
  saveDraft();

  // Countdown during engine warmup — playback starts after GO.
  state.cancelIntro?.();
  stopPlayback();
  state.playbackMs = PACE_MS[el("pace")?.value] || PACE_MS.cinema;
  state.introActive = true;
  state.introHandle = playBattleIntro(el("labStage"), { round: 1, stepMs: 480 });
  state.cancelIntro = () => state.introHandle?.cancel();
  state.introHandle.done.then(() => {
    state.introActive = false;
    kickPlayback();
  });

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
    state.introHandle?.cancel();
    state.introActive = false;
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
  if (!state.editor) return;
  const ext = EXT[state.lang];
  const suggested = `${el("botName").value.trim() || "Starter"}${ext}`;
  const source = state.editor.getValue();

  if (window.showSaveFilePicker) {
    try {
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
      await writable.write(source);
      await writable.close();
      state.dirty = false;
      saveDraft();
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
      showErr(e instanceof Error ? e.message : String(e));
      return;
    }
  }

  // Fallback: download blob (Firefox / Safari / no FSA)
  const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  a.click();
  URL.revokeObjectURL(a.href);
  state.dirty = false;
  saveDraft();
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
    setDraftBadge("editando…", true);
    saveDraft();
  });

  if (window.showOpenFilePicker) el("btnOpen").hidden = false;
  // Always show Arquivo — FSA when available, otherwise download fallback
  el("btnSave").hidden = false;

  el("lang").onchange = async () => {
    await setLang(el("lang").value);
    refreshLibrarySelect();
  };
  el("example").onchange = () => loadPlaystyle(el("example").value);
  el("difficulty").onchange = () => saveDraft();
  el("pace").onchange = () => saveDraft();
  el("botName").onchange = () => saveDraft();
  el("btnDeploy").onclick = () => deploy();
  el("btnOpen").onclick = () => openFile();
  el("btnSave").onclick = () => saveFile();
  el("btnSaveAs").onclick = () => saveNamedDraft();
  el("librarySelect").onchange = () => syncLibraryButtons();
  el("btnLoadDraft").onclick = () => loadNamedDraft();
  el("btnDeleteDraft").onclick = () => deleteNamedDraft();
  el("btnDocs").onclick = () => {
    const panel = el("labDocs");
    const btn = el("btnDocs");
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  el("btnShortcuts").onclick = () => {
    const panel = el("labShortcuts");
    const btn = el("btnShortcuts");
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };

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

  refreshLibrarySelect();
  const draft = loadDraft("ts");
  if (draft?.exampleId) state.exampleId = draft.exampleId;
  await setLang("ts", { force: true });
  refreshLibrarySelect();
  setDraftBadge("salvo", false);
  setStatus("idle", "");
}

boot().catch((e) => showErr(e instanceof Error ? e.message : String(e)));
