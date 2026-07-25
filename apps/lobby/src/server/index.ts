import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { RoomStore } from "./rooms";
import { extractAndValidateZipAsync } from "./zip";
import AdmZip from "adm-zip";
import {
  deployLab,
  loadTemplate,
  listExamples,
  loadExample,
  sweepOldLabSessions,
  type LabDifficulty,
  type LabLang,
  type LabPace,
} from "./lab";
import type { PublicRoom } from "../shared/types";

const ROOT = resolve(import.meta.dir, "../../../..");
const UPLOADS = join(ROOT, "data/uploads");
const LAB_ROOT = join(ROOT, "data/lab");
const DIST = join(import.meta.dir, "../../dist");
mkdirSync(UPLOADS, { recursive: true });
mkdirSync(LAB_ROOT, { recursive: true });
sweepOldLabSessions(LAB_ROOT);
setInterval(() => sweepOldLabSessions(LAB_ROOT), 15 * 60_000);

const PORT = Number(process.env.PORT || process.env.LOBBY_PORT || 7610);
const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:7601";
/** Soft cap for workshop rooms (override with LOBBY_MAX_PLAYERS). */
const MAX_PLAYERS = Number(process.env.LOBBY_MAX_PLAYERS || 40);
let PUBLIC_URL = process.env.PUBLIC_URL || null;

const rooms = new RoomStore(() => PUBLIC_URL);

const app = new Hono();
app.use("*", cors());

app.get("/api/samples/:file", async (c) => {
  const file = c.req.param("file");
  const name = file.replace(/\.zip$/i, "");
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name)) {
    return c.json({ error: "invalid sample name" }, 400);
  }
  // Prefer prebuilt fixture zip; else pack bots/fixture/<Name>/
  const prebuilt = join(ROOT, "bots/fixture/zips", `${name}.zip`);
  if (existsSync(prebuilt)) {
    return new Response(Bun.file(prebuilt), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}.zip"`,
      },
    });
  }
  const dir = join(ROOT, "bots/fixture", name);
  const jsonPath = join(dir, `${name}.json`);
  if (!existsSync(jsonPath)) {
    return c.json({ error: "sample not found" }, 404);
  }
  const zip = new AdmZip();
  for (const entry of ["json", "ts", "js", "java", "py", "cs", "sh", "cmd"]) {
    const p = join(dir, `${name}.${entry}`);
    if (existsSync(p)) {
      zip.addFile(`${name}/${name}.${entry}`, readFileSync(p));
    }
  }
  // package.json optional for node bots
  const pkg = join(dir, "package.json");
  if (existsSync(pkg)) zip.addFile(`${name}/package.json`, readFileSync(pkg));

  const buf = zip.toBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Content-Length": String(buf.byteLength),
    },
  });
});

app.get("/api/health", async (c) => {
  let engineOk = false;
  let trOk = false;
  let trPort: number | null = null;
  try {
    const r = await fetch(`${ENGINE_URL}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    engineOk = r.ok;
    if (r.ok) {
      const j = (await r.json()) as { trOk?: boolean; trPort?: number };
      trOk = !!j.trOk;
      trPort = typeof j.trPort === "number" ? j.trPort : null;
    }
  } catch {
    engineOk = false;
  }
  return c.json(
    {
      ok: true,
      engine: ENGINE_URL,
      engineOk,
      trOk,
      trPort,
      publicUrl: PUBLIC_URL,
      viewerPath: "/viewer/",
    },
    engineOk ? 200 : 503,
  );
});

/** Public TR observer endpoint — secret stays server-side (injected by /tr proxy). */
app.get("/api/tr", async (c) => {
  let trOk = false;
  let trPort: number | null = null;
  try {
    const r = await fetch(`${ENGINE_URL}/tr`, {
      signal: AbortSignal.timeout(2500),
    });
    if (r.ok) {
      const j = (await r.json()) as { ok?: boolean; port?: number };
      trOk = !!j.ok;
      trPort = typeof j.port === "number" ? j.port : null;
    }
  } catch {
    trOk = false;
  }
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "localhost";
  const fwd = (c.req.header("x-forwarded-proto") || "").split(",")[0]?.trim();
  const scheme =
    fwd === "https" || (!fwd && PORT === 443)
      ? "wss"
      : c.req.url.startsWith("https")
        ? "wss"
        : "ws";
  return c.json({
    ok: trOk,
    trPort,
    wsUrl: `${scheme}://${host}/tr`,
    path: "/tr",
    secret: "", // lobby /tr proxy injects controller secret
    viewerUrl: "/viewer/",
  });
});

app.post("/api/public-url", async (c) => {
  const body = await c.req.json<{ url?: string }>();
  if (body.url) PUBLIC_URL = body.url.replace(/\/$/, "");
  return c.json({ publicUrl: PUBLIC_URL });
});

app.post("/api/rooms", (c) => {
  const { room, ownerToken } = rooms.create();
  return c.json({ room, ownerToken, joinPath: `/r/${room.code}` });
});

app.get("/api/rooms/:code", (c) => {
  const room = rooms.get(c.req.param("code"));
  if (!room) return c.json({ error: "not found" }, 404);
  return c.json({ room: rooms.toPublic(room) });
});

app.get("/api/rooms/:code/events", (c) => {
  const code = c.req.param("code");
  if (!rooms.get(code)) return c.json({ error: "not found" }, 404);
  return streamSSE(c, async (stream) => {
    let closed = false;
    c.req.raw.signal.addEventListener("abort", () => {
      closed = true;
    });
    const unsub = rooms.subscribe(code, async (room: PublicRoom) => {
      if (closed) return;
      await stream.writeSSE({ event: "room", data: JSON.stringify(room) });
    });
    while (!closed) {
      await stream.sleep(15000);
      if (!closed) await stream.writeSSE({ event: "ping", data: "{}" });
    }
    unsub();
  });
});

app.post("/api/rooms/:code/join", async (c) => {
  try {
    const body = await c.req.json<{
      nick: string;
      color: string;
      chassis?: string;
    }>();
    const result = rooms.join(c.req.param("code"), body, MAX_PLAYERS);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.patch("/api/rooms/:code/players/:playerId", async (c) => {
  try {
    const body = await c.req.json();
    const room = rooms.updatePlayer(
      c.req.param("code"),
      c.req.param("playerId"),
      body,
    );
    return c.json({ room });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.post("/api/rooms/:code/players/:playerId/upload", async (c) => {
  try {
    const code = c.req.param("code");
    const playerId = c.req.param("playerId");
    const room = rooms.get(code);
    if (!room) return c.json({ error: "not found" }, 404);
    if (!room.players.has(playerId))
      return c.json({ error: "player not found" }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const validated = await extractAndValidateZipAsync(
      buf,
      UPLOADS,
      `${code}-${playerId}`,
    );
    const pub = rooms.updatePlayer(code, playerId, {
      botPath: validated.botDir,
      botName: validated.botName,
      lang: validated.lang,
      ready: false,
    });
    return c.json({
      room: pub,
      botName: validated.botName,
      botPath: validated.botDir,
      lang: validated.lang,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.post("/api/rooms/:code/play", async (c) => {
  const code = c.req.param("code");
  const ownerToken = c.req.header("x-owner-token");
  if (!rooms.isOwner(code, ownerToken)) {
    return c.json({ error: "owner token required" }, 403);
  }
  const room = rooms.get(code);
  if (!room) return c.json({ error: "not found" }, 404);
  const pub = rooms.toPublic(room);
  if (!pub.canPlay) return c.json({ error: "not all players ready" }, 400);

  const botPaths = [...room.players.values()].map((p) => p.botPath!);
  rooms.setStatus(code, "starting", { error: null, results: null });

  try {
    const res = await fetch(`${ENGINE_URL}/battles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        botPaths,
        rounds: 5,
        turnTimeoutMicros: 50_000,
        startDelayMs: 2000,
        gunCoolingRate: 0.08,
        maxInactivityTurns: 700,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      rooms.setStatus(code, "failed", { error: text });
      return c.json({ error: text }, 502);
    }
    const { id } = (await res.json()) as { id: string };
    rooms.setStatus(code, "running", { battleId: id });

    // poll engine in background for end state
    void (async () => {
      for (;;) {
        await Bun.sleep(1000);
        try {
          const snap = (await fetch(`${ENGINE_URL}/battles/${id}`).then((r) =>
            r.json(),
          )) as {
            status: string;
            results?: unknown[];
            error?: string;
          };
          if (snap.status === "ENDED") {
            rooms.setStatus(code, "ended", { results: snap.results || [] });
            break;
          }
          if (snap.status === "FAILED" || snap.status === "STOPPED") {
            rooms.setStatus(code, "failed", {
              error: snap.error || snap.status,
            });
            break;
          }
        } catch (e) {
          rooms.setStatus(code, "failed", {
            error: e instanceof Error ? e.message : String(e),
          });
          break;
        }
      }
    })();

    return c.json({ battleId: id, room: rooms.toPublic(room) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    rooms.setStatus(code, "failed", { error: msg });
    return c.json({ error: msg }, 502);
  }
});

app.post("/api/rooms/:code/reset", async (c) => {
  const ownerToken = c.req.header("x-owner-token");
  if (!rooms.isOwner(c.req.param("code"), ownerToken)) {
    return c.json({ error: "owner token required" }, 403);
  }
  rooms.resetLobby(c.req.param("code"));
  return c.json({ room: rooms.toPublic(rooms.get(c.req.param("code"))!) });
});

app.get("/api/battles/:id/proxy-ws-info", (c) => {
  // Same-origin path — lobby proxies to engine (Railway only exposes one PORT).
  const id = c.req.param("id");
  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    `127.0.0.1:${PORT}`;
  const fwd = c.req.header("x-forwarded-proto");
  const proto = fwd === "https" || (!fwd && PORT === 443) ? "wss" : "ws";
  // Prefer relative construction on https edge
  const scheme =
    fwd === "https" || c.req.url.startsWith("https") ? "wss" : proto;
  return c.json({
    wsUrl: `${scheme}://${host}/api/battles/${id}/ws`,
    path: `/api/battles/${id}/ws`,
  });
});

app.get("/api/lab/templates/:lang", (c) => {
  try {
    const lang = c.req.param("lang") as LabLang;
    if (!["ts", "java", "python"].includes(lang)) {
      return c.json({ error: "lang must be ts|java|python" }, 400);
    }
    return c.json(loadTemplate(lang));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
  }
});

app.get("/api/lab/examples", (c) => {
  return c.json({ examples: listExamples() });
});

app.get("/api/lab/examples/:id", (c) => {
  try {
    const lang = (c.req.query("lang") || "ts") as LabLang;
    if (!["ts", "java", "python"].includes(lang)) {
      return c.json({ error: "lang must be ts|java|python" }, 400);
    }
    return c.json(loadExample(c.req.param("id"), lang));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
  }
});

app.post("/api/lab/deploy", async (c) => {
  try {
    const body = await c.req.json<{
      lang?: LabLang;
      botName?: string;
      source?: string;
      difficulty?: LabDifficulty;
      pace?: LabPace;
    }>();
    const lang = body.lang;
    const difficulty = body.difficulty;
    const pace = body.pace || "cinema";
    if (!lang || !["ts", "java", "python"].includes(lang)) {
      return c.json({ error: "lang must be ts|java|python" }, 400);
    }
    if (!difficulty || !["easy", "medium", "hard"].includes(difficulty)) {
      return c.json({ error: "difficulty must be easy|medium|hard" }, 400);
    }
    if (!["cinema", "watch", "normal"].includes(pace)) {
      return c.json({ error: "pace must be cinema|watch|normal" }, 400);
    }
    if (!body.botName || typeof body.source !== "string") {
      return c.json({ error: "botName and source required" }, 400);
    }
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "local";
    const result = await deployLab({
      lang,
      botName: body.botName,
      source: body.source,
      difficulty,
      pace: pace as LabPace,
      engineUrl: ENGINE_URL,
      labRoot: LAB_ROOT,
      clientIp: ip,
    });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "BUSY") {
      return c.json({ error: "Battle em andamento, espera" }, 409);
    }
    if (msg === "RATE_LIMIT") {
      return c.json({ error: "Rate limit — max 6 deploys/min" }, 429);
    }
    return c.json({ error: msg }, 400);
  }
});

app.get("/api/lab/battles/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const r = await fetch(`${ENGINE_URL}/battles/${id}`);
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

app.get("/api/scale/results", async (c) => {
  const path = join(ROOT, "data/scale-results/matrix.json");
  if (!existsSync(path)) return c.json({ results: [] });
  return c.json({ results: JSON.parse(await Bun.file(path).text()) });
});

const CLIENT = join(import.meta.dir, "../client");
const VIEWER = join(import.meta.dir, "../../viewer");

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

app.get("/client/*", async (c) => {
  const rel = c.req.path.replace(/^\/client\//, "");
  if (rel.includes("..")) return c.text("bad path", 400);
  const filePath = join(CLIENT, rel);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.text("not found", 404);
  const ext = rel.includes(".")
    ? `.${rel.split(".").pop()!.toLowerCase()}`
    : "";
  const type = MIME[ext] || file.type || "application/octet-stream";
  return new Response(file, { headers: { "Content-Type": type } });
});

/** Official Tank Royale Viewer (Pixi) — built into apps/lobby/viewer. */
app.get("/viewer", (c) => c.redirect("/viewer/", 302));
app.get("/viewer/", async (c) => {
  const index = join(VIEWER, "index.html");
  if (!existsSync(index)) {
    return c.html(
      `<!doctype html><meta charset=utf-8><title>Viewer</title>
       <p>Viewer ainda não buildado. Rode <code>bun scripts/build-viewer.ts</code>.</p>
       <p><a href="/lab">← Lab</a></p>`,
      503,
    );
  }
  return new Response(Bun.file(index), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
app.get("/viewer/*", async (c) => {
  const rel = c.req.path.replace(/^\/viewer\//, "");
  if (!rel || rel.includes("..")) return c.text("bad path", 400);
  const filePath = join(VIEWER, rel);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.text("not found", 404);
  const ext = rel.includes(".")
    ? `.${rel.split(".").pop()!.toLowerCase()}`
    : "";
  const type = MIME[ext] || file.type || "application/octet-stream";
  return new Response(file, { headers: { "Content-Type": type } });
});

app.get("/r/:code", async (c) => {
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

app.get("/scale", async (c) => {
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

app.get("/lab", async (c) => {
  const html = await Bun.file(join(CLIENT, "lab.html")).text();
  return c.html(html);
});

app.get("/", async (c) => {
  if (existsSync(DIST)) {
    return new Response(Bun.file(join(DIST, "index.html")));
  }
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

console.log(`Lobby listening on http://0.0.0.0:${PORT}`);
console.log(`Engine URL: ${ENGINE_URL}`);
console.log(`Viewer: ${existsSync(join(VIEWER, "index.html")) ? "/viewer/" : "(not built)"}`);

type WsKind = "battle" | "tr";
type WsData = {
  kind: WsKind;
  battleId: string;
  upstream: WebSocket | null;
  observerSecret: string;
};

function engineWsBase() {
  return ENGINE_URL.replace(/^http/, "ws").replace(/\/$/, "");
}

async function fetchTrUpstream(): Promise<{
  wsUrl: string;
  secret: string;
} | null> {
  try {
    const r = await fetch(`${ENGINE_URL}/tr`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ok?: boolean;
      port?: number;
      serverUrl?: string;
      observerSecret?: string;
    };
    if (!j.ok || !j.port) return null;
    const url =
      typeof j.serverUrl === "string" && j.serverUrl.startsWith("ws")
        ? j.serverUrl
        : `ws://127.0.0.1:${j.port}`;
    return { wsUrl: url, secret: j.observerSecret || "" };
  } catch {
    return null;
  }
}

function injectObserverSecret(raw: string | Buffer, secret: string): string | Buffer {
  if (!secret) return raw;
  try {
    const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
    const msg = JSON.parse(text) as { type?: string; secret?: string };
    if (msg?.type === "ObserverHandshake" && !msg.secret) {
      msg.secret = secret;
      return JSON.stringify(msg);
    }
  } catch {
    /* pass through */
  }
  return raw;
}

export default {
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 120,
  async fetch(req: Request, server: Bun.Server<WsData>) {
    const url = new URL(req.url);
    if (url.pathname === "/tr") {
      const ok = server.upgrade(req, {
        data: {
          kind: "tr",
          battleId: "",
          upstream: null,
          observerSecret: "",
        },
      });
      if (ok) return undefined as unknown as Response;
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }
    const m = url.pathname.match(/^\/api\/battles\/([^/]+)\/ws$/);
    if (m) {
      const battleId = m[1];
      const ok = server.upgrade(req, {
        data: {
          kind: "battle",
          battleId,
          upstream: null,
          observerSecret: "",
        },
      });
      if (ok) return undefined as unknown as Response;
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }
    return app.fetch(req);
  },
  websocket: {
    async open(ws: Bun.ServerWebSocket<WsData>) {
      if (ws.data.kind === "tr") {
        const tr = await fetchTrUpstream();
        if (!tr) {
          try {
            ws.close(1013, "TR server unavailable");
          } catch {
            /* */
          }
          return;
        }
        ws.data.observerSecret = tr.secret;
        const upstream = new WebSocket(tr.wsUrl);
        ws.data.upstream = upstream;
        upstream.addEventListener("message", (ev) => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                typeof ev.data === "string"
                  ? ev.data
                  : new Uint8Array(ev.data as ArrayBuffer),
              );
            }
          } catch {
            /* */
          }
        });
        upstream.addEventListener("close", () => {
          try {
            ws.close();
          } catch {
            /* */
          }
        });
        upstream.addEventListener("error", () => {
          try {
            ws.close(1011, "TR upstream error");
          } catch {
            /* */
          }
        });
        return;
      }

      const upstreamUrl = `${engineWsBase()}/battles/${ws.data.battleId}/ws`;
      const upstream = new WebSocket(upstreamUrl);
      ws.data.upstream = upstream;

      upstream.addEventListener("message", (ev) => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              typeof ev.data === "string"
                ? ev.data
                : new Uint8Array(ev.data as ArrayBuffer),
            );
          }
        } catch {
          /* ignore fanout errors */
        }
      });
      upstream.addEventListener("close", () => {
        try {
          ws.close();
        } catch {
          /* */
        }
      });
      upstream.addEventListener("error", () => {
        try {
          ws.close(1011, "upstream error");
        } catch {
          /* */
        }
      });
    },
    message(ws: Bun.ServerWebSocket<WsData>, message: string | Buffer) {
      const up = ws.data.upstream;
      if (!up || up.readyState !== WebSocket.OPEN) return;
      const payload =
        ws.data.kind === "tr"
          ? injectObserverSecret(message, ws.data.observerSecret)
          : message;
      if (typeof payload === "string") up.send(payload);
      else up.send(payload);
    },
    close(ws: Bun.ServerWebSocket<WsData>) {
      try {
        ws.data.upstream?.close();
      } catch {
        /* */
      }
    },
  },
};
