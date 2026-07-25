/** Shared arena visual helpers — bullets, radar cones, tick lerp. */

/**
 * @param {{pad:number,s:number,maxY:number}} map
 */
export function drawBullets(ctx, bullets, map) {
  const list = bullets || [];
  if (!list.length) return;
  const { pad, s, maxY } = map;

  for (const bu of list) {
    const x = pad + (bu.x || 0) * s;
    const y = pad + (maxY - (bu.y || 0)) * s;
    const dir = (-(bu.direction || 0) * Math.PI) / 180;
    const power = Math.max(0.1, Math.min(3, bu.power ?? 1));
    const len = 10 + power * 8;
    const color = bu.color && /^#[0-9a-fA-F]{6}$/.test(bu.color) ? bu.color : "#ffe566";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir);

    const grad = ctx.createLinearGradient(-len, 0, 4, 0);
    grad.addColorStop(0, "rgba(255,229,102,0)");
    grad.addColorStop(0.55, "rgba(255,229,102,0.55)");
    grad.addColorStop(1, "#fff6c8");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5 + power;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 1.6 + power * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Radar sweep wedge + gun line — what the bot is "looking at".
 * TR angles: 0° = east, CCW. Canvas Y is flipped via map.
 */
export function drawBotSensors(ctx, bot, map, { emphasize = false } = {}) {
  const { pad, s, maxY } = map;
  const x = pad + (bot.x || 0) * s;
  const y = pad + (maxY - (bot.y || 0)) * s;
  const radarDeg = bot.radarDirection ?? bot.direction ?? 0;
  const gunDeg = bot.gunDirection ?? bot.direction ?? 0;
  // radarSweep is degrees swept this turn; show a readable cone (min ~18°)
  const sweep = Math.max(18, Math.min(90, Math.abs(bot.radarSweep ?? 45)));
  const range = (emphasize ? 320 : 240) * s;

  const toCanvasAngle = (deg) => (-deg * Math.PI) / 180;
  const a0 = toCanvasAngle(radarDeg + sweep / 2);
  const a1 = toCanvasAngle(radarDeg - sweep / 2);

  ctx.save();
  ctx.translate(x, y);

  // radar fill
  const grd = ctx.createRadialGradient(0, 0, 4, 0, 0, range);
  if (emphasize) {
    grd.addColorStop(0, "rgba(61,224,255,0.28)");
    grd.addColorStop(0.55, "rgba(61,224,255,0.1)");
    grd.addColorStop(1, "rgba(61,224,255,0)");
  } else {
    grd.addColorStop(0, "rgba(255,255,255,0.12)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.04)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, range, a0, a1, true);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = emphasize ? "rgba(61,224,255,0.55)" : "rgba(200,220,240,0.28)";
  ctx.lineWidth = emphasize ? 1.5 : 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, range, a0, a1, true);
  ctx.closePath();
  ctx.stroke();

  // center radar beam
  const beam = toCanvasAngle(radarDeg);
  ctx.strokeStyle = emphasize ? "rgba(61,224,255,0.85)" : "rgba(180,210,230,0.4)";
  ctx.lineWidth = emphasize ? 1.6 : 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(beam) * range, Math.sin(beam) * range);
  ctx.stroke();

  // gun aim (shorter, warmer)
  const gun = toCanvasAngle(gunDeg);
  const gunLen = 36 * s;
  ctx.strokeStyle = emphasize ? "rgba(255,200,80,0.9)" : "rgba(255,180,80,0.45)";
  ctx.lineWidth = emphasize ? 2 : 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(gun) * gunLen, Math.sin(gun) * gunLen);
  ctx.stroke();

  ctx.restore();
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Interpolate two tick payloads (bots + bullets by id). */
export function lerpTicks(from, to, t) {
  if (!from) return to;
  if (!to) return from;
  const u = Math.max(0, Math.min(1, t));
  const fromBots = new Map((from.bots || []).map((b) => [b.id, b]));
  const bots = (to.bots || []).map((b) => {
    const a = fromBots.get(b.id);
    if (!a) return b;
    return {
      ...b,
      x: lerp(a.x ?? 0, b.x ?? 0, u),
      y: lerp(a.y ?? 0, b.y ?? 0, u),
      direction: lerpAngle(a.direction ?? 0, b.direction ?? 0, u),
      gunDirection: lerpAngle(
        a.gunDirection ?? a.direction ?? 0,
        b.gunDirection ?? b.direction ?? 0,
        u,
      ),
      radarDirection: lerpAngle(
        a.radarDirection ?? a.direction ?? 0,
        b.radarDirection ?? b.direction ?? 0,
        u,
      ),
      radarSweep: lerp(a.radarSweep ?? 45, b.radarSweep ?? 45, u),
      energy: lerp(a.energy ?? 0, b.energy ?? 0, u),
      speed: lerp(a.speed ?? 0, b.speed ?? 0, u),
    };
  });
  // bullets: prefer `to` positions (fast); light lerp if same id exists
  const fromBullets = new Map((from.bullets || []).map((b) => [b.id, b]));
  const bullets = (to.bullets || []).map((b) => {
    const a = fromBullets.get(b.id);
    if (!a) return b;
    return {
      ...b,
      x: lerp(a.x ?? 0, b.x ?? 0, u),
      y: lerp(a.y ?? 0, b.y ?? 0, u),
      direction: lerpAngle(a.direction ?? 0, b.direction ?? 0, u),
    };
  });
  return {
    ...to,
    turn: to.turn,
    round: to.round,
    bots,
    bullets,
  };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/**
 * Countdown overlay. Designed to run during BOOTING/warmup, not over live combat.
 * @returns {{ cancel: () => void, done: Promise<void>, skipToGo: () => void }}
 */
export function playBattleIntro(stageEl, { round = 1, stepMs = 480 } = {}) {
  const noop = {
    cancel() {},
    done: Promise.resolve(),
    skipToGo() {},
  };
  if (!stageEl) return noop;

  stageEl.querySelector(".battle-intro")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "battle-intro";
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <p class="battle-intro-kicker">ROUND ${round}</p>
    <p class="battle-intro-count" id="battleIntroCount">3</p>
  `;
  stageEl.appendChild(overlay);

  const countEl = overlay.querySelector("#battleIntroCount");
  const steps = ["3", "2", "1", "GO"];
  let i = 0;
  let cancelled = false;
  let timer = 0;
  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });

  const finish = () => {
    overlay.remove();
    resolveDone();
  };

  const showStep = () => {
    if (cancelled) return;
    const label = steps[i];
    countEl.textContent = label;
    overlay.classList.toggle("is-go", label === "GO");
    i += 1;
    if (i >= steps.length) {
      timer = window.setTimeout(finish, 420);
      return;
    }
    timer = window.setTimeout(showStep, stepMs);
  };
  showStep();

  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      finish();
    },
    skipToGo() {
      if (cancelled) return;
      clearTimeout(timer);
      i = steps.length - 1;
      countEl.textContent = "GO";
      overlay.classList.add("is-go");
      timer = window.setTimeout(finish, 380);
    },
    done,
  };
}
