#!/usr/bin/env bun
/**
 * Start ngrok tunnel and register PUBLIC_URL with lobby.
 * Requires ngrok installed and authed.
 */
const lobby = process.env.LOBBY_URL || "http://127.0.0.1:7610";
const port = Number(process.env.LOBBY_PORT || 7610);

const proc = Bun.spawn(["ngrok", "http", String(port), "--log=stdout"], {
  stdout: "pipe",
  stderr: "pipe",
});

console.log("Starting ngrok… waiting for public URL");

async function findUrl(ms = 30_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const api = await fetch("http://127.0.0.1:4040/api/tunnels").then((r) => r.json()) as {
        tunnels?: { public_url: string }[];
      };
      const url = api.tunnels?.find((t) => t.public_url.startsWith("https"))?.public_url
        || api.tunnels?.[0]?.public_url;
      if (url) return url;
    } catch {}
    await Bun.sleep(500);
  }
  throw new Error("ngrok URL not found — is ngrok installed?");
}

const url = await findUrl();
console.log("Public URL:", url);
await fetch(`${lobby}/api/public-url`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url }),
});
console.log("Registered with lobby. Keep this process running.");
await proc.exited;
