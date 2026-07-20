import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { RoomStore } from "./rooms";
import { extractAndValidateZipAsync } from "./zip";
import type { PublicRoom } from "../shared/types";

const ROOT = resolve(import.meta.dir, "../../../..");
const UPLOADS = join(ROOT, "data/uploads");
const DIST = join(import.meta.dir, "../../dist");
mkdirSync(UPLOADS, { recursive: true });

const PORT = Number(process.env.LOBBY_PORT || 7610);
const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:7601";
let PUBLIC_URL = process.env.PUBLIC_URL || null;

const rooms = new RoomStore(() => PUBLIC_URL);

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) =>
  c.json({ ok: true, engine: ENGINE_URL, publicUrl: PUBLIC_URL }),
);

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
    const body = await c.req.json<{ nick: string; color: string }>();
    const result = rooms.join(c.req.param("code"), body);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.patch("/api/rooms/:code/players/:playerId", async (c) => {
  try {
    const body = await c.req.json();
    const room = rooms.updatePlayer(c.req.param("code"), c.req.param("playerId"), body);
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
    if (!room.players.has(playerId)) return c.json({ error: "player not found" }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const validated = await extractAndValidateZipAsync(buf, UPLOADS, `${code}-${playerId}`);
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
      body: JSON.stringify({ botPaths, rounds: 3 }),
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
          const snap = await fetch(`${ENGINE_URL}/battles/${id}`).then((r) => r.json()) as {
            status: string;
            results?: unknown[];
            error?: string;
          };
          if (snap.status === "ENDED") {
            rooms.setStatus(code, "ended", { results: snap.results || [] });
            break;
          }
          if (snap.status === "FAILED" || snap.status === "STOPPED") {
            rooms.setStatus(code, "failed", { error: snap.error || snap.status });
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
  // client connects directly to engine WS; expose URL
  const engineWs = ENGINE_URL.replace(/^http/, "ws");
  return c.json({ wsUrl: `${engineWs}/battles/${c.req.param("id")}/ws` });
});

app.get("/api/scale/results", async (c) => {
  const path = join(ROOT, "data/scale-results/matrix.json");
  if (!existsSync(path)) return c.json({ results: [] });
  return c.json({ results: JSON.parse(await Bun.file(path).text()) });
});

const CLIENT = join(import.meta.dir, "../client");

app.get("/client/*", async (c) => {
  const rel = c.req.path.replace(/^\/client\//, "");
  if (rel.includes("..")) return c.text("bad path", 400);
  const file = Bun.file(join(CLIENT, rel));
  if (!(await file.exists())) return c.text("not found", 404);
  return new Response(file);
});

app.get("/r/:code", async (c) => {
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

app.get("/scale", async (c) => {
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

app.get("/", async (c) => {
  if (existsSync(DIST)) {
    return new Response(Bun.file(join(DIST, "index.html")));
  }
  const html = await Bun.file(join(CLIENT, "index.html")).text();
  return c.html(html);
});

console.log(`Lobby listening on http://127.0.0.1:${PORT}`);
console.log(`Engine URL: ${ENGINE_URL}`);

export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 120,
};
