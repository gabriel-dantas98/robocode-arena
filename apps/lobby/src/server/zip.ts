import AdmZip from "adm-zip";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  chmodSync,
  readdirSync,
  statSync,
  symlinkSync,
} from "fs";
import { join, basename, resolve } from "path";

const MAX_ZIP_BYTES = 15 * 1024 * 1024;
const ROOT = resolve(import.meta.dir, "../../../..");

export type BotLang =
  | "typescript"
  | "javascript"
  | "java"
  | "python"
  | "csharp";

export type ValidatedBot = {
  botDir: string;
  botName: string;
  lang: BotLang;
};

export async function extractAndValidateZipAsync(
  zipBuffer: Buffer,
  destRoot: string,
  playerId: string,
): Promise<ValidatedBot> {
  if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error("Zip too large (max 15MB)");
  }

  const playerDir = join(destRoot, playerId);
  if (existsSync(playerDir))
    rmSync(playerDir, { recursive: true, force: true });
  mkdirSync(playerDir, { recursive: true });

  const zip = new AdmZip(zipBuffer);
  for (const e of zip.getEntries()) {
    const name = e.entryName.replace(/\\/g, "/");
    if (name.startsWith("__MACOSX")) continue;
    if (name.includes("..") || name.startsWith("/")) {
      throw new Error("Invalid path in zip");
    }
  }
  zip.extractAllTo(playerDir, true);

  const botDir = findBotDir(playerDir);
  const botName = basename(botDir);
  const jsonPath = join(botDir, `${botName}.json`);
  if (!existsSync(jsonPath)) throw new Error(`Missing ${botName}.json`);

  const lang = detectLang(botDir, botName);
  ensureBootAssets(botDir, botName, lang);

  const shPath = join(botDir, `${botName}.sh`);
  if (existsSync(shPath)) chmodSync(shPath, 0o755);
  const cmdPath = join(botDir, `${botName}.cmd`);
  if (existsSync(cmdPath)) chmodSync(cmdPath, 0o755);

  const meta = JSON.parse(await Bun.file(jsonPath).text());
  if (!meta.name || !meta.version || !meta.authors) {
    throw new Error("JSON must include name, version, authors");
  }

  return { botDir: resolve(botDir), botName, lang };
}

function detectLang(botDir: string, botName: string): BotLang {
  const has = (ext: string) => existsSync(join(botDir, `${botName}${ext}`));
  if (has(".ts")) return "typescript";
  if (has(".js")) return "javascript";
  if (has(".java") || has(".jar")) return "java";
  if (has(".py")) return "python";
  if (has(".cs") || has(".csproj")) return "csharp";
  throw new Error(
    `Unsupported bot: need ${botName}.{ts|js|java|jar|py|cs|csproj}. Multi-lang: TypeScript, JavaScript, Java, Python, C#.`,
  );
}

export function ensureBootAssets(
  botDir: string,
  botName: string,
  lang: BotLang,
) {
  const shPath = join(botDir, `${botName}.sh`);

  if (lang === "typescript" || lang === "javascript") {
    // ESM ignores NODE_PATH — link shared workshop deps into the bot dir.
    const sharedNm = join(ROOT, "bots/node_modules");
    const localNm = join(botDir, "node_modules");
    if (existsSync(sharedNm) && !existsSync(localNm)) {
      try {
        symlinkSync(sharedNm, localNm, "dir");
      } catch {
        // leave for host install
      }
    }
    const pkg = join(botDir, "package.json");
    if (!existsSync(pkg)) {
      writeFileSync(
        pkg,
        JSON.stringify(
          {
            private: true,
            type: "module",
            dependencies: {
              "@robocode.dev/tank-royale-bot-api": "1.0.2",
              tsx: "^4.19.2",
              ws: "^8.18.1",
            },
          },
          null,
          2,
        ),
      );
    }
    // Always rewrite launcher so uploads don't depend on machine-specific paths in the zip.
    const runner =
      lang === "typescript"
        ? `"${ROOT}/bots/node_modules/.bin/tsx" "${botName}.ts"`
        : `node "${botName}.js"`;
    writeFileSync(
      shPath,
      `#!/bin/sh\nset -e\ncd -- "$(dirname -- "$0")"\nexport NODE_OPTIONS="--disable-warning=ExperimentalWarning"\nexec ${runner}\n`,
    );
  }

  if (lang === "java") {
    const libJar = `${ROOT}/bots/lib/robocode-tankroyale-bot-api-1.0.2.jar`;
    if (existsSync(join(botDir, `${botName}.jar`))) {
      writeFileSync(
        shPath,
        `#!/bin/sh\nset -e\ncd -- "$(dirname -- "$0")"\nexec java -jar "${botName}.jar"\n`,
      );
    } else {
      // Always rewrite so lab/workshop .java bots compile with the shared API jar.
      writeFileSync(
        shPath,
        `#!/bin/sh\nset -e\ncd -- "$(dirname -- "$0")"\njavac -cp "${libJar}" "${botName}.java"\nexec java -cp "${libJar}:." "${botName}"\n`,
      );
    }
  }

  if (lang === "python") {
    // Docker image puts /opt/robocode-py/bin on PATH (venv with bot API).
    writeFileSync(
      shPath,
      `#!/bin/sh\nset -e\ncd -- "$(dirname -- "$0")"\nexec python3 "${botName}.py"\n`,
    );
  }

  if (lang === "csharp" && !existsSync(shPath)) {
    writeFileSync(
      shPath,
      `#!/bin/sh\nset -e\ncd -- "$(dirname -- "$0")"\nexec dotnet run --project "${botName}.csproj"\n`,
    );
  }
}

function findBotDir(playerDir: string): string {
  const kids = readdirSync(playerDir).filter((n) => !n.startsWith("."));
  for (const kid of kids) {
    const p = join(playerDir, kid);
    if (statSync(p).isDirectory()) {
      const json = join(p, `${kid}.json`);
      if (existsSync(json)) return p;
    }
  }
  const dirs = kids.filter((k) => statSync(join(playerDir, k)).isDirectory());
  if (dirs.length === 1) return join(playerDir, dirs[0]);
  throw new Error("Could not find bot directory (expect BotName/BotName.json)");
}
