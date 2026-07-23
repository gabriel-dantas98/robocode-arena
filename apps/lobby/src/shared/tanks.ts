/** Chassis catalog — software-dev puns (r/ProgrammerHumor energy). Visual only. */
export const CHASSIS_IDS = [
  "segfault",
  "stackoverflow",
  "techdebt",
  "docker",
  "bikeshed",
] as const;
export type ChassisId = (typeof CHASSIS_IDS)[number];

export type ChassisMeta = {
  id: ChassisId;
  name: string;
  blurb: string;
};

export const CHASSIS: ChassisMeta[] = [
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

/** Map legacy ids from early builds → current pun ids */
const LEGACY: Record<string, ChassisId> = {
  wedge: "segfault",
  scout: "stackoverflow",
  heavy: "techdebt",
  box: "docker",
  diamond: "bikeshed",
};

export function normalizeChassis(raw: unknown): ChassisId {
  if (typeof raw !== "string") return "segfault";
  if ((CHASSIS_IDS as readonly string[]).includes(raw)) return raw as ChassisId;
  if (LEGACY[raw]) return LEGACY[raw];
  return "segfault";
}
