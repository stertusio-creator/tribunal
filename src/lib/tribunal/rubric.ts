import { snapBand, type ParsedRubric } from "@/lib/tribunal/consigna";
import type {
  AspectId,
  AspectScore,
  Evaluation,
  ForensicReport,
  Integrity,
  Level,
  Outcome,
  TextStats,
} from "@/lib/tribunal/types";

export const ASPECT_COPY: Record<
  AspectId,
  { name: string; descriptor: string }
> = {
  pertinencia: {
    name: "Pertinencia y comprensión de la consigna",
    descriptor: "Responde a lo pedido, no a un tema vecino.",
  },
  argumentacion: {
    name: "Argumentación y profundidad conceptual",
    descriptor: "Hay tesis, razones y matices, no una lista de afirmaciones.",
  },
  evidencia: {
    name: "Evidencia, fuentes y rigor",
    descriptor: "Fuentes localizables y datos, no «estudios demuestran».",
  },
  estructura: {
    name: "Estructura, cohesión y redacción",
    descriptor: "Orden, transiciones reales y prosa que se puede leer.",
  },
  originalidad: {
    name: "Originalidad, voz propia y aporte crítico",
    descriptor: "Detalle situado, juicio propio y una voz reconocible.",
  },
};

const ORDER: AspectId[] = [
  "pertinencia",
  "argumentacion",
  "evidencia",
  "estructura",
  "originalidad",
];

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(20, Math.max(0, Math.round(value)));
}

export function aspectLevel(score: number): string {
  if (score <= 5) return "Deficiente";
  if (score <= 9) return "Insuficiente";
  if (score <= 13) return "Aceptable";
  if (score <= 16) return "Sólido";
  return "Destacado";
}

export function makeAspect(
  id: AspectId,
  score: number,
  justification: string,
): AspectScore {
  const safe = clampScore(score);
  return {
    id,
    name: ASPECT_COPY[id].name,
    descriptor: ASPECT_COPY[id].descriptor,
    score: safe,
    max: 20,
    level: aspectLevel(safe),
    justification,
  };
}

function overlap(brief: string, text: string): number {
  const stop = new Set(
    "de la el los las un una y o u en que del al con por para su sus se es son como más mas no si ya lo le les este esta esto ese esa eso una unos unas the of and to a in for on".split(
      " ",
    ),
  );
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 3 && !stop.has(word)),
    );
  const a = tokens(brief);
  const b = tokens(text);
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const word of a) if (b.has(word)) hit += 1;
  return hit / a.size;
}

export function estimateRubric(
  text: string,
  brief: string,
  level: Level,
  forensic: ForensicReport,
): AspectScore[] {
  const stats: TextStats = forensic.stats;
  const folded = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  let pertinencia = 11;
  let pertinenciaWhy =
    "No hay consigna del docente. Se mira si el texto sostiene un tema, sin bajarle la nota por eso.";
  if (brief.trim().length >= 40) {
    const share = overlap(brief, text);
    pertinencia = Math.round(6 + share * 13);
    pertinenciaWhy =
      share >= 0.28
        ? `El texto recoge una parte reconocible de la consigna (solapamiento aproximado ${Math.round(share * 100)} %).`
        : share >= 0.12
          ? `La consigna y el texto comparten poco vocabulario sustantivo (${Math.round(share * 100)} %). Puede estar al lado del encargo, no dentro.`
          : "Casi no dialoga con las palabras de la consigna. O no la leyó, o respondió otra cosa.";
  }

  const markers = (
    folded.match(
      /\b(porque|ya que|sin embargo|no obstante|aunque|por tanto|por ello|en cambio|mientras que|pero|despite|however|because)\b/g,
    ) ?? []
  ).length;
  let argumentacion = 7 + Math.min(6, markers) + (stats.paragraphs >= 4 ? 3 : stats.paragraphs >= 2 ? 1 : 0);
  if (stats.avgSentenceWords > 42 || (stats.avgSentenceWords > 0 && stats.avgSentenceWords < 8)) {
    argumentacion -= 2;
  }
  const argumentacionWhy =
    markers >= 4
      ? `Hay ${markers} giros de contraste o causa. Alcanza para una argumentación, no para darla por profunda.`
      : "Casi no hay contraste ni causa explícita. Predomina la afirmación seguida de otra afirmación.";

  let evidencia = 5 + Math.min(10, stats.citationCount * 3);
  if (stats.bibliographyLikely) evidencia += 2;
  if (stats.urlCount > 0) evidencia += 1;
  if (stats.digitGroups >= 3) evidencia += 2;
  if (stats.unbackedStudies) evidencia -= 3;
  if (level === "posgrado" && stats.citationCount === 0) evidencia = Math.min(evidencia, 8);
  if (level === "pregrado" && stats.citationCount === 0) evidencia = Math.min(evidencia, 11);
  if (level === "secundaria" && stats.citationCount === 0 && stats.digitGroups >= 2) {
    evidencia = Math.max(evidencia, 9);
  }
  const evidenciaWhy =
    stats.citationCount > 0
      ? `${stats.citationCount} cita${stats.citationCount === 1 ? "" : "s"} con forma reconocible${stats.bibliographyLikely ? " y un apartado de referencias" : ""}.`
      : level === "posgrado"
        ? "En posgrado, cero fuentes localizables deja el rigor por debajo de lo exigible."
        : "No hay citas localizables. Lo que se afirma queda en el aire.";

  let estructura = 8;
  const hasClose = /en conclusion|para cerrar|en sintesis|al final|cierre/.test(folded);
  const hasOpen = stats.paragraphs >= 2;
  if (hasOpen && hasClose) estructura += 4;
  if (stats.paragraphs >= 3 && stats.paragraphs <= 18) estructura += 2;
  if (stats.paragraphs < 2) estructura = Math.min(estructura, 8);
  if (stats.markdownResidue) estructura -= 1;
  const estructuraWhy =
    stats.paragraphs < 2
      ? "El texto llega en un bloque solo. No se ve un orden de lectura."
      : hasClose
        ? `${stats.paragraphs} párrafos y un cierre reconocible. La estructura existe; la calidad de los enlaces es otra cosa.`
        : `${stats.paragraphs} párrafos, sin un cierre que ate lo anterior.`;

  let originalidad = 13;
  if (stats.firstPerson >= 3) originalidad += 3;
  if (stats.digitGroups >= 2) originalidad += 2;
  if (stats.words >= 500 && stats.firstPerson === 0 && stats.digitGroups === 0) originalidad -= 2;
  const originalidadWhy =
    stats.firstPerson >= 3
      ? "Hay una voz en primera persona y algún detalle propio. Eso suma en lo académico y no decide si lo escribió el alumno."
      : "El texto explica el tema. No se le pide una voz literaria para considerar bien lograda esta parte.";

  const aspects = [
    makeAspect("pertinencia", pertinencia, pertinenciaWhy),
    makeAspect("argumentacion", argumentacion, argumentacionWhy),
    makeAspect("evidencia", evidencia, evidenciaWhy),
    makeAspect("estructura", estructura, estructuraWhy),
    makeAspect("originalidad", originalidad, originalidadWhy),
  ];
  return applyScorePolicy(aspects, brief, fuseFloor(forensic));
}

function fuseFloor(forensic: ForensicReport): number {
  return forensic.smokingGun ? Math.max(forensic.score, 96) : forensic.score;
}

export function fuseProbability(
  forensic: ForensicReport,
  modelProbability: number | null,
): number {
  if (modelProbability == null) return fuseFloor(forensic);
  let score = modelProbability;
  if (forensic.smokingGun) score = Math.max(score, 96);
  if (forensic.score >= 55) score = Math.max(score, forensic.score - 3);
  score = Math.max(score, Math.round(forensic.score * 0.88));
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function applyScorePolicy(
  aspects: AspectScore[],
  _brief: string,
  _aiProbability: number,
): AspectScore[] {
  const byId = new Map(aspects.map((aspect) => [aspect.id, aspect]));
  return ORDER.map((id) => {
    const current = byId.get(id) ?? makeAspect(id, 0, "Sin lectura de este aspecto.");
    return makeAspect(id, current.score, current.justification.trim() || "Sin justificación.");
  });
}

export function contentTotals(aspects: AspectScore[]): {
  contentPoints: number;
  contentMax: number;
  contentGrade: number;
} {
  const contentPoints = aspects.reduce((sum, aspect) => sum + aspect.score, 0);
  const contentMax = aspects.reduce((sum, aspect) => sum + (aspect.max || 20), 0) || 100;
  return {
    contentPoints,
    contentMax,
    contentGrade: Math.round((contentPoints / contentMax) * 100) / 10,
  };
}

export function aspectsFromRubric(
  rubric: ParsedRubric,
  proposed: { id?: string; name?: string; score: number; justification: string }[],
): AspectScore[] {
  return rubric.criteria.map((criterion, index) => {
    const found =
      proposed.find((item) => item.id && item.id === criterion.id) ??
      proposed.find((item) => item.name && foldKey(item.name) === foldKey(criterion.name)) ??
      proposed[index];
    const band = snapBand(Number.isFinite(found?.score) ? found.score : 0, criterion.bands);
    const descriptor = (band.description || criterion.bands[0]?.description || "").slice(0, 220);
    return {
      id: criterion.id,
      name: criterion.name,
      descriptor,
      score: band.score,
      max: criterion.max,
      level: band.name,
      justification: found?.justification?.trim() || "Sin justificación.",
    };
  });
}

function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function estimateOnRubric(text: string, rubric: ParsedRubric): AspectScore[] {
  return aspectsFromRubric(
    rubric,
    rubric.criteria.map((criterion) => {
      const share = overlap(`${criterion.name}. ${criterion.bands[0]?.description ?? ""}`, text);
      const picked =
        share >= 0.45
          ? criterion.bands[0]
          : share >= 0.25
            ? (criterion.bands[1] ?? criterion.bands[0])
            : share >= 0.12
              ? (criterion.bands[2] ?? criterion.bands[criterion.bands.length - 1])
              : criterion.bands[criterion.bands.length - 1];
      return {
        id: criterion.id,
        score: picked?.score ?? 0,
        justification: `Estimación por cercanía al criterio (${Math.round(share * 100)} % de vocabulario), sin lectura del modelo.`,
      };
    }),
  );
}

export function decideVerdict(
  contentGrade: number,
  aiProbability: number,
  smokingGun: boolean,
): Evaluation["verdict"] {
  const institutional = contentGrade;
  let headline = "Poco probable que lo escribió una IA";
  let outcome: Outcome = contentGrade >= 6 ? "aprobado" : "insuficiente";
  let integrity: Integrity = "limpia";
  let explanation = `Este ${aiProbability} % es la probabilidad de que el texto lo haya escrito una IA, no el alumno. Con este número, lo más razonable es atribuirlo al alumno.`;

  if (smokingGun || aiProbability >= 80) {
    headline = "Muy probable que lo escribió una IA";
    outcome = "rechazado";
    integrity = "rechazada";
    explanation = smokingGun
      ? `Este ${aiProbability} % es la probabilidad de que lo haya escrito una IA, no el alumno. No es una impresión de estilo: el archivo deja huella de una herramienta que genera texto. Cada razón está abajo.`
      : `Este ${aiProbability} % es la probabilidad de que lo haya escrito una IA, no el alumno. Sale de frases muy parejas, muletillas de modelo y poca huella de alguien que estuvo ahí.`;
  } else if (aiProbability >= 55) {
    headline = "Probable que lo escribió una IA";
    outcome = "observado";
    integrity = "observada";
    explanation = `Este ${aiProbability} % es la probabilidad de que lo haya escrito una IA, no el alumno. Ya no es una duda menor: una parte importante no parece del alumno.`;
  } else if (aiProbability >= 35) {
    headline = "Puede haberlo escrito con ayuda de IA";
    outcome = "aprobado-reserva";
    integrity = "reserva";
    explanation = `Este ${aiProbability} % es la probabilidad de que lo haya escrito una IA, no el alumno. No cierra el caso, pero tampoco permite tratarlo como escrito solo por el alumno.`;
  }

  const band =
    institutional >= 9
      ? "Muy bien logrado"
      : institutional >= 7
        ? "Bien logrado"
        : institutional >= 6
          ? "Suficiente"
          : institutional >= 5
            ? "Justo"
            : "Escaso";

  return {
    institutionalGrade: Math.round(institutional * 10) / 10,
    outcome,
    integrity,
    passed: institutional >= 6,
    headline,
    explanation,
    band,
  };
}

export function estimateFeedback(
  aspects: AspectScore[],
  forensic: ForensicReport,
): { summary: string; strengths: string[]; improvements: string[] } {
  const strongest = [...aspects].sort((a, b) => b.score - a.score)[0];
  const weakest = [...aspects].sort((a, b) => a.score - b.score)[0];
  return {
    summary: forensic.smokingGun
      ? "La nota mira solo el texto: si responde, si se entiende y si aporta algo. Que el archivo huela a IA no baja estos puntos."
      : "La nota mira si el texto responde, si se entiende y si aporta algo. Es una lectura simple, no un tribunal de estilo.",
    strengths:
      strongest && strongest.score >= 12
        ? [`${strongest.name}: ${strongest.justification}`]
        : ["No hay un aspecto que esta estimación pueda llamar sólido."],
    improvements: [
      weakest ? `${weakest.name}: ${weakest.justification}` : "Revisar la consigna.",
      forensic.signals.find((signal) => signal.severity === "critical" || signal.severity === "high")
        ?.detail ?? "Pida el archivo original si solo recibió texto pegado.",
    ],
  };
}
