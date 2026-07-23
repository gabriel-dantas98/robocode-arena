/** Procedural tank sprites — chassis ids are software-dev puns. Paint only. */

export const CHASSIS = [
  {
    id: "segfault",
    name: "Segfault",
    blurb: "Undefined behavior com lagartas. Coredump na primeira wall.",
  },
  {
    id: "stackoverflow",
    name: "Stack Overflow",
    blurb: "Canhão longo. Copia a resposta aceita sem ler o resto.",
  },
  {
    id: "techdebt",
    name: "Tech Debt",
    blurb: "Monólito blindado. Todo mundo depende. Ninguém ousa mexer.",
  },
  {
    id: "docker",
    name: "It Works™",
    blurb: "Caixa mágica. 'Roda em qualquer lugar' — cite essa frase.",
  },
  {
    id: "bikeshed",
    name: "Bikeshed",
    blurb: "Discussão infinita sobre a cor. O build? Depois a gente vê.",
  },
];

const LEGACY = {
  wedge: "segfault",
  scout: "stackoverflow",
  heavy: "techdebt",
  box: "docker",
  diamond: "bikeshed",
};

export function normalizeChassis(id) {
  if (CHASSIS.some((c) => c.id === id)) return id;
  if (LEGACY[id]) return LEGACY[id];
  return "segfault";
}

function shade(hex, amt) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (num & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a tank centered at (0,0), facing +X (caller rotates by direction).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ chassis: string, color: string, scale?: number, energy?: number }} opts
 */
export function drawTank(ctx, opts) {
  const chassis = normalizeChassis(opts.chassis);
  const color = opts.color || "#E4572E";
  const scale = opts.scale ?? 1;
  const dark = shade(color, -45);
  const light = shade(color, 55);
  const metal = "#1a222c";
  const rim = "#c8d4e0";

  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (chassis === "techdebt") drawTracks(ctx, metal, rim, 18, 14);
  if (chassis === "docker") drawTracks(ctx, metal, rim, 16, 12);

  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (chassis === "segfault") {
    ctx.moveTo(12, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-10, -9);
  } else if (chassis === "stackoverflow") {
    ctx.moveTo(11, 0);
    ctx.lineTo(2, 6);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-11, -5);
    ctx.lineTo(2, -6);
  } else if (chassis === "techdebt") {
    roundRectPath(ctx, -12, -9, 22, 18, 3);
  } else if (chassis === "docker") {
    roundRectPath(ctx, -11, -8, 20, 16, 2);
  } else {
    // bikeshed
    ctx.moveTo(12, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-12, 0);
    ctx.lineTo(0, -9);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(-6, -5);
  ctx.lineTo(6, -2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, 0, chassis === "techdebt" ? 6.5 : 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.stroke();

  const gunLen = chassis === "stackoverflow" ? 18 : chassis === "techdebt" ? 14 : 13;
  const gunW = chassis === "techdebt" ? 3.2 : 2.2;
  ctx.fillStyle = rim;
  ctx.fillRect(2, -gunW / 2, gunLen, gunW);
  ctx.fillStyle = metal;
  ctx.fillRect(gunLen - 1, -gunW / 2 - 0.6, 3, gunW + 1.2);

  ctx.strokeStyle = "#7ee0ff";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, -0.8, 0.8);
  ctx.stroke();

  ctx.restore();
}

function drawTracks(ctx, metal, rim, halfW, halfH) {
  ctx.fillStyle = metal;
  roundRectPath(ctx, -halfW, -halfH - 2, halfW * 2, 4, 1);
  ctx.fill();
  roundRectPath(ctx, -halfW, halfH - 2, halfW * 2, 4, 1);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.8;
  for (let i = -halfW + 2; i < halfW; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, -halfH);
    ctx.lineTo(i, -halfH + 2);
    ctx.moveTo(i, halfH);
    ctx.lineTo(i, halfH + 2);
    ctx.stroke();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paintChassisPreview(canvas, chassis, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0c1218";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(126,224,255,0.15)";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(w / 2, h / 2);
  drawTank(ctx, { chassis, color, scale: 2.1 });
  ctx.restore();
}
