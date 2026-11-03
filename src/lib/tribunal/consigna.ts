export type RubricBand = {
  name: string;
  score: number;
  description: string;
};

export type RubricCriterion = {
  id: string;
  name: string;
  max: number;
  bands: RubricBand[];
};

export type ParsedRubric = {
  criteria: RubricCriterion[];
  maxTotal: number;
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function slug(name: string, used: Set<string>): string {
  const base =
    fold(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "criterio";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function parseCell(cell: string): { score: number; description: string } | null {
  const match = cell.match(/^(\d{1,3})\s*[·•\-|–—:]?\s*([\s\S]*)$/);
  if (!match) return null;
  const score = Number(match[1]);
  if (!Number.isFinite(score) || score <= 0 || score > 100) return null;
  return { score, description: match[2].replace(/\s+/g, " ").trim() };
}

export function parseRubric(brief: string): ParsedRubric | null {
  const lines = brief.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let header: string[] | null = null;
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = splitRow(line);
    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (!header) {
      const joined = fold(cells.join(" "));
      if (joined.includes("sobresaliente") && (joined.includes("insuficiente") || joined.includes("competente"))) {
        header = cells;
      }
      continue;
    }
    rows.push(cells);
  }
  if (!header || rows.length < 3) return null;
  const bandNames = header.slice(1).filter(Boolean);
  if (bandNames.length < 3) return null;
  const used = new Set<string>();
  const criteria: RubricCriterion[] = [];
  for (const row of rows) {
    const name = row[0]?.replace(/^\d+\s*[.)]\s*/, "").trim() ?? "";
    if (!name || fold(name) === "criterio") continue;
    const bands: RubricBand[] = [];
    for (let index = 0; index < bandNames.length; index += 1) {
      const parsed = parseCell(row[index + 1] ?? "");
      if (!parsed) continue;
      bands.push({
        name: bandNames[index] ?? `Nivel ${index + 1}`,
        score: parsed.score,
        description: parsed.description,
      });
    }
    if (bands.length < 3) continue;
    bands.sort((a, b) => b.score - a.score);
    criteria.push({
      id: slug(name, used),
      name,
      max: bands[0]?.score ?? 0,
      bands,
    });
  }
  if (criteria.length < 3 || criteria.length > 8) return null;
  return {
    criteria,
    maxTotal: criteria.reduce((sum, criterion) => sum + criterion.max, 0),
  };
}

export function snapBand(score: number, bands: RubricBand[]): RubricBand {
  let best = bands[bands.length - 1] ?? bands[0];
  if (!best) return { name: "Sin nivel", score: 0, description: "" };
  let bestDistance = Infinity;
  for (const band of bands) {
    const distance = Math.abs(band.score - score);
    if (distance < bestDistance || (distance === bestDistance && band.score < best.score)) {
      best = band;
      bestDistance = distance;
    }
  }
  return best;
}
