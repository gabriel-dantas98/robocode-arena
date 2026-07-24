import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  materializeBotFromSource,
  resolveOpponents,
  listExamples,
  loadExample,
} from "./lab";

describe("materializeBotFromSource", () => {
  test("writes ts bot dir with json + sh", () => {
    const root = mkdtempSync(join(tmpdir(), "lab-"));
    const r = materializeBotFromSource({
      destRoot: root,
      botName: "MyBot",
      lang: "ts",
      source: "console.log(1)\n",
    });
    expect(existsSync(join(r.botDir, "MyBot.ts"))).toBe(true);
    expect(existsSync(join(r.botDir, "MyBot.json"))).toBe(true);
    expect(existsSync(join(r.botDir, "MyBot.sh"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects bad botName", () => {
    const root = mkdtempSync(join(tmpdir(), "lab-"));
    expect(() =>
      materializeBotFromSource({
        destRoot: root,
        botName: "1bad",
        lang: "ts",
        source: "x",
      }),
    ).toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveOpponents", () => {
  test("returns 3 easy paths", () => {
    const paths = resolveOpponents("easy");
    expect(paths).toHaveLength(3);
    for (const p of paths) expect(existsSync(p)).toBe(true);
  });
});

describe("lab examples", () => {
  test("catalog has 5 playstyles", () => {
    const list = listExamples();
    expect(list.length).toBe(5);
    expect(list.map((e) => e.id).sort()).toEqual(
      ["rammer", "spinner", "starter", "tracker", "walls"].sort(),
    );
  });

  test("each example loads for ts/java/python", () => {
    for (const ex of listExamples()) {
      for (const lang of ["ts", "java", "python"] as const) {
        const loaded = loadExample(ex.id, lang);
        expect(loaded.source.length).toBeGreaterThan(40);
        expect(loaded.botName).toBe(ex.botName);
      }
    }
  });
});
