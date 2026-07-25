import {
  mkdirSync,
  writeFileSync,
  existsSync,
  chmodSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { join, resolve } from "path";
import { nanoid } from "nanoid";
import { ensureBootAssets, type BotLang } from "./zip";

export type LabLang = "ts" | "java" | "python";
export type LabDifficulty = "easy" | "medium" | "hard";
/** Spectator pacing — client tick playback (engine BattleRunner is single-threaded). */
export type LabPace = "cinema" | "watch" | "normal";

/** Inspired by official TPS docs + tank-royale-viewer broadcast watching. */
export const LAB_PACE = {
  cinema: {
    turnTimeoutMicros: 50_000,
    playbackMs: 220,
    rounds: 5,
    gunCoolingRate: 0.06,
    maxInactivityTurns: 900,
    startDelayMs: 2200,
  },
  watch: {
    turnTimeoutMicros: 50_000,
    playbackMs: 140,
    rounds: 5,
    gunCoolingRate: 0.08,
    maxInactivityTurns: 700,
    startDelayMs: 2200,
  },
  normal: {
    turnTimeoutMicros: 40_000,
    playbackMs: 55,
    rounds: 3,
    gunCoolingRate: 0.1,
    maxInactivityTurns: 450,
    startDelayMs: 1500,
  },
} as const satisfies Record<
  LabPace,
  {
    turnTimeoutMicros: number;
    playbackMs: number;
    rounds: number;
    gunCoolingRate: number;
    maxInactivityTurns: number;
    startDelayMs: number;
  }
>;

const EXT: Record<LabLang, string> = {
  ts: ".ts",
  java: ".java",
  python: ".py",
};

const ZIP_LANG: Record<LabLang, BotLang> = {
  ts: "typescript",
  java: "java",
  python: "python",
};

const OPPONENTS: Record<LabDifficulty, string[]> = {
  easy: ["SittingDuck1", "SittingDuck2", "SittingDuck3"],
  medium: ["Scout1", "Scout2", "Scout3"],
  hard: ["Predator1", "Predator2", "Predator3"],
};

const ROOT = resolve(import.meta.dir, "../../../..");
const OPPONENTS_ROOT = join(ROOT, "bots/opponents");
const TEMPLATES_ROOT = join(ROOT, "bots/lab-templates");
const EXAMPLES_ROOT = join(ROOT, "bots/lab-examples");

export type LabExampleMeta = {
  id: string;
  botName: string;
  title: string;
  blurb: string;
  tactics?: string[];
};

export function listExamples(): LabExampleMeta[] {
  const path = join(EXAMPLES_ROOT, "catalog.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as LabExampleMeta[];
}

export function loadExample(
  id: string,
  lang: LabLang,
): {
  id: string;
  lang: LabLang;
  botName: string;
  filename: string;
  source: string;
  title: string;
  blurb: string;
  tactics?: string[];
} {
  const meta = listExamples().find((e) => e.id === id);
  if (!meta) throw new Error(`Unknown example: ${id}`);
  const filename = `${meta.botName}${EXT[lang]}`;
  const path = join(EXAMPLES_ROOT, lang, filename);
  if (!existsSync(path)) throw new Error(`Example ${id} missing for ${lang}`);
  return {
    id,
    lang,
    botName: meta.botName,
    filename,
    source: readFileSync(path, "utf8"),
    title: meta.title,
    blurb: meta.blurb,
    tactics: meta.tactics,
  };
}

export function loadTemplate(lang: LabLang): {
  lang: LabLang;
  botName: string;
  filename: string;
  source: string;
} {
  try {
    const ex = loadExample("starter", lang);
    return {
      lang: ex.lang,
      botName: ex.botName,
      filename: ex.filename,
      source: ex.source,
    };
  } catch {
    /* fall through to legacy LabBot */
  }
  const botName = "LabBot";
  const filename = `${botName}${EXT[lang]}`;
  const path = join(TEMPLATES_ROOT, lang, filename);
  if (!existsSync(path)) throw new Error(`Template not found for ${lang}`);
  return {
    lang,
    botName,
    filename,
    source: readFileSync(path, "utf8"),
  };
}

let labBusy = false;
let busyClearTimer: ReturnType<typeof setTimeout> | null = null;
const rateByIp = new Map<string, number[]>();

export function materializeBotFromSource(opts: {
  destRoot: string;
  botName: string;
  lang: LabLang;
  source: string;
}): { botDir: string; botName: string; lang: LabLang } {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(opts.botName)) {
    throw new Error(
      "Invalid botName (use letters/numbers/underscore, start with letter)",
    );
  }
  if (opts.source.length > 200_000) throw new Error("Source too large (max 200KB)");
  if (!(opts.lang in EXT)) throw new Error("Unsupported lang");

  const botDir = join(opts.destRoot, opts.botName);
  if (existsSync(botDir)) rmSync(botDir, { recursive: true, force: true });
  mkdirSync(botDir, { recursive: true });

  writeFileSync(
    join(botDir, `${opts.botName}.json`),
    JSON.stringify(
      {
        name: opts.botName,
        version: "0.1.0",
        authors: ["lab"],
        description: "Lab IDE bot",
      },
      null,
      2,
    ),
  );
  writeFileSync(join(botDir, `${opts.botName}${EXT[opts.lang]}`), opts.source);
  ensureBootAssets(botDir, opts.botName, ZIP_LANG[opts.lang]);
  const sh = join(botDir, `${opts.botName}.sh`);
  if (existsSync(sh)) chmodSync(sh, 0o755);
  return { botDir: resolve(botDir), botName: opts.botName, lang: opts.lang };
}

export function resolveOpponents(difficulty: LabDifficulty): string[] {
  const names = OPPONENTS[difficulty];
  if (!names) throw new Error("Invalid difficulty");
  const paths = names.map((n) => join(OPPONENTS_ROOT, difficulty, n));
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`Missing opponent bot: ${p}`);
    ensureBootAssets(p, basenameSafe(p), "typescript");
    const sh = join(p, `${basenameSafe(p)}.sh`);
    if (existsSync(sh)) chmodSync(sh, 0o755);
  }
  return paths.map((p) => resolve(p));
}

function basenameSafe(p: string) {
  return p.split(/[/\\]/).filter(Boolean).pop()!;
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 6;
  const arr = (rateByIp.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new Error("RATE_LIMIT");
  arr.push(now);
  rateByIp.set(ip, arr);
}

export function isLabBusy() {
  return labBusy;
}

export async function deployLab(opts: {
  lang: LabLang;
  botName: string;
  source: string;
  difficulty: LabDifficulty;
  pace?: LabPace;
  engineUrl: string;
  labRoot: string;
  clientIp: string;
}): Promise<{ battleId: string; botPath: string; opponents: string[] }> {
  checkRateLimit(opts.clientIp);
  if (labBusy) {
    const err = new Error("BUSY");
    throw err;
  }

  const session = nanoid(10);
  const destRoot = join(opts.labRoot, session);
  mkdirSync(destRoot, { recursive: true });

  const player = materializeBotFromSource({
    destRoot,
    botName: opts.botName,
    lang: opts.lang,
    source: opts.source,
  });
  const opponents = resolveOpponents(opts.difficulty);
  const botPaths = [player.botDir, ...opponents];
  const pace = LAB_PACE[opts.pace && opts.pace in LAB_PACE ? opts.pace : "cinema"];

  labBusy = true;
  if (busyClearTimer) clearTimeout(busyClearTimer);
  // Cinema 5 rounds @ 2 TPS can run several minutes
  busyClearTimer = setTimeout(() => {
    labBusy = false;
  }, 12 * 60_000);

  try {
    const res = await fetch(`${opts.engineUrl}/battles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botPaths,
        rounds: pace.rounds,
        turnTimeoutMicros: pace.turnTimeoutMicros,
        startDelayMs: pace.startDelayMs,
        gunCoolingRate: pace.gunCoolingRate,
        maxInactivityTurns: pace.maxInactivityTurns,
      }),
    });
    if (!res.ok) {
      labBusy = false;
      const text = await res.text();
      throw new Error(`Engine error: ${text || res.status}`);
    }
    const body = (await res.json()) as { id: string };
    void watchBattleUntilDone(opts.engineUrl, body.id);
    return {
      battleId: body.id,
      botPath: player.botDir,
      opponents,
    };
  } catch (e) {
    labBusy = false;
    throw e;
  }
}

async function watchBattleUntilDone(engineUrl: string, id: string) {
  for (let i = 0; i < 360; i++) {
    await Bun.sleep(2000);
    try {
      const r = await fetch(`${engineUrl}/battles/${id}`);
      if (!r.ok) continue;
      const snap = (await r.json()) as { status?: string };
      const st = snap.status;
      if (st === "ENDED" || st === "FAILED" || st === "STOPPED") {
        labBusy = false;
        return;
      }
    } catch {
      /* keep polling */
    }
  }
  labBusy = false;
}

/** Delete lab sessions older than 1h. */
export function sweepOldLabSessions(labRoot: string) {
  if (!existsSync(labRoot)) return;
  const cutoff = Date.now() - 3600_000;
  for (const name of readdirSync(labRoot)) {
    const p = join(labRoot, name);
    try {
      if (!statSync(p).isDirectory()) continue;
      if (statSync(p).mtimeMs < cutoff) {
        rmSync(p, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
}
