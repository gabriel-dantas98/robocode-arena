const ROOT = "/Users/gdantas/git/gdantas/robocode-arena";
const paths = [1, 2, 3].map(
  (i) => `${ROOT}/data/generated/stubs/Stub${String(i).padStart(4, "0")}`,
);
const start = await fetch("http://127.0.0.1:7601/battles", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ botPaths: paths, rounds: 1 }),
}).then((r) => r.json());
console.log("start", start);
const id = start.id;
for (let i = 0; i < 90; i++) {
  await Bun.sleep(1000);
  const snap = await fetch(`http://127.0.0.1:7601/battles/${id}`).then((r) => r.json());
  console.log(
    i,
    snap.status,
    `${snap.bootConnected}/${snap.bootExpected}`,
    "turn",
    snap.turnNumber,
    snap.error || "",
  );
  if (snap.status === "ENDED" || snap.status === "FAILED") {
    console.log(JSON.stringify(snap, null, 2));
    break;
  }
}
const health = await fetch("http://127.0.0.1:7601/health").then((r) => r.json());
console.log("health after", health);
