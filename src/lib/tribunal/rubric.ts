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
    "No hay consigna del docente. La pertinencia se mira solo por coherencia interna y queda topada en 14.";
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

  let originalidad = Math.round(18 - forensic.score / 6);
  if (stats.firstPerson >= 4) originalidad += 2;
  if (stats.digitGroups >= 3) originalidad += 1;
  if (stats.words >= 400 && stats.firstPerson === 0 && stats.digitGroups === 0) originalidad -= 3;
  const originalidadWhy =
    forensic.smokingGun
      ? "Hay un hallazgo crítico de generación. La voz propia no se puede acreditar."
      : forensic.score >= 60
        ? "La prosa se parece demasiado a una entrega de modelo como para conceder voz propia."
        : stats.firstPerson >= 4
          ? "Hay primera persona y algún detalle situado. Eso no prueba autoría, pero es lo que esta estimación puede ver."
          : "Poca voz situada. La estimación no encuentra un caso, una duda o un juicio que parezca de alguien.";

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
  return forensic.smokingGun ? Math.max(forensic.score, 92) : forensic.score;
}

export function fuseProbability(
  forensic: ForensicReport,
  modelProbability: number | null,
): number {
  if (modelProbability == null) return fuseFloor(forensic);
  let score = modelProbability;
  if (forensic.smokingGun) score = Math.max(score, 90);
  if (forensic.score >= 70) score = Math.max(score, forensic.score - 8);
  score = Math.max(score, Math.round(forensic.score * 0.72));
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function applyScorePolicy(
  aspects: AspectScore[],
  brief: string,
  aiProbability: number,
): AspectScore[] {
  const byId = new Map(aspects.map((aspect) => [aspect.id, aspect]));
  return ORDER.map((id) => {
    const current = byId.get(id) ?? makeAspect(id, 0, "Sin lectura de este aspecto.");
    let score = current.score;
    let justification = current.justification.trim();
    if (id === "pertinencia" && brief.trim().length < 40 && score > 14) {
      score = 14;
      justification = `${justification} Tope de mesa: sin consigna, la pertinencia no pasa de 14.`.trim();
    }
    if (id === "originalidad" && aiProbability >= 85) {
      score = Math.min(score, 3);
    } else if (id === "originalidad" && aiProbability >= 75) {
      score = Math.min(score, 6);
    } else if (id === "originalidad" && aiProbability >= 65) {
      score = Math.min(score, 9);
    }
    return makeAspect(id, score, justification || "Sin justificación.");
  });
}

export function contentTotals(aspects: AspectScore[]): {
  contentPoints: number;
  contentGrade: number;
} {
  const contentPoints = aspects.reduce((sum, aspect) => sum + aspect.score, 0);
  return {
    contentPoints,
    contentGrade: Math.round(contentPoints) / 10,
  };
}

export function decideVerdict(
  contentGrade: number,
  aiProbability: number,
  smokingGun: boolean,
): Evaluation["verdict"] {
  let institutional = contentGrade;
  let integrity: Integrity = "limpia";
  let outcome: Outcome = contentGrade >= 6 ? "aprobado" : "insuficiente";
  let explanation =
    "La probabilidad de generación queda por debajo del umbral de sanción. La nota institucional es la nota de contenido. Eso no certifica autoría humana: solo dice que esta mesa no encontró motivo para recortar.";

  if (smokingGun || aiProbability >= 85) {
    institutional = 0;
    integrity = "rechazada";
    outcome = "rechazado";
    explanation = smokingGun
      ? "Hay un hallazgo crítico —metadato de herramienta generativa o el propio texto declarándose generado—. El reglamento pone la nota institucional en 0. La matriz de contenido se conserva como retroalimentación y no como calificación."
      : "La probabilidad de mesa llega al umbral de rechazo (85 o más). La nota institucional es 0. La matriz describe el texto; no lo acredita.";
  } else if (aiProbability >= 65) {
    institutional = Math.min(contentGrade, 4);
    integrity = "observada";
    outcome = "observado";
    explanation = `Probabilidad ${aiProbability}. Entre 65 y 84 el trabajo queda observado: la nota institucional es el mínimo entre la nota de contenido y 4,0. No aprueba, aunque el texto esté bien escrito.`;
  } else if (aiProbability >= 45) {
    institutional = Math.max(0, Math.round((contentGrade - 2) * 10) / 10);
    integrity = "reserva";
    outcome = institutional >= 6 ? "aprobado-reserva" : "insuficiente";
    explanation = `Probabilidad ${aiProbability}. Entre 45 y 64 se descuentan 2,0 puntos sobre la nota de contenido. ${
      institutional >= 6
        ? "Después del descuento todavía alcanza el 6,0: aprobado con reserva, no una absolución."
        : "Después del descuento no alcanza el 6,0."
    }`;
  }

  const headline =
    outcome === "rechazado"
      ? "No acreditable"
      : outcome === "observado"
        ? "Observado"
        : outcome === "aprobado-reserva"
          ? "Aprobado con reserva"
          : outcome === "aprobado"
            ? "Aprobado"
            : integrity === "reserva"
              ? "Insuficiente, con reserva"
              : "Insuficiente";

  const band =
    outcome === "rechazado"
      ? "Rechazado"
      : institutional >= 9
        ? "Sobresaliente"
        : institutional >= 7
          ? "Notable"
          : institutional >= 6
            ? "Aprobado"
            : institutional >= 5
              ? "Insuficiente"
              : "Deficiente";

  return {
    institutionalGrade: Math.round(institutional * 10) / 10,
    outcome,
    integrity,
    passed: outcome === "aprobado" || outcome === "aprobado-reserva",
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
      ? "La mesa estima el contenido con reglas porque no hubo lectura del modelo, y el archivo ya trae un hallazgo crítico de generación."
      : "Lectura de respaldo, sin modelo: la matriz sale de reglas sobre la consigna, las citas, la estructura y el indicio forense. Sirve para no dejar el acta en blanco; no sustituye una segunda lectura docente.",
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
