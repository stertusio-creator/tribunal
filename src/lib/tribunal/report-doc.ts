import type { Evaluation, SignalSeverity } from "@/lib/tribunal/types";
import { LEVEL_LABEL } from "@/lib/tribunal/types";

type Block = Record<string, unknown>;

const INK = "#1c1e21";
const MUTED = "#5c636b";
const ACCENT = "#243044";
const LINE = "#e3dfd6";
const PAPER = "#f7f5f0";

const SEVERITY: Record<SignalSeverity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
  info: "Nota",
};

function grade(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} / 10`;
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function cell(text: string, extra: Block = {}): Block {
  return { text: text || "—", fontSize: 9, color: INK, margin: [0, 1, 0, 1], ...extra };
}

function headCell(text: string): Block {
  return { text, bold: true, fontSize: 8, color: "#f6f4ef", margin: [0, 2, 0, 2] };
}

const tableLayout = {
  hLineWidth: (index: number, node: { table: { body: unknown[] } }) =>
    index === 0 || index === 1 || index === node.table.body.length ? 0.8 : 0.3,
  vLineWidth: () => 0,
  hLineColor: () => LINE,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (index: number) => (index === 0 ? ACCENT : index % 2 === 0 ? PAPER : null),
};

function bullets(items: string[], empty: string): string[] {
  const source = items.length > 0 ? items : [empty];
  return source.map((item) => item);
}

function section(title: string): Block {
  return { text: title, style: "h2" };
}

function paragraph(text: string): Block {
  return { text, margin: [0, 0, 0, 6], alignment: "justify" };
}

function keyTable(rows: [string, string][]): Block {
  return {
    table: {
      widths: [140, "*"],
      body: rows.map(([label, value]) => [
        { text: label, bold: true, fontSize: 9, color: MUTED },
        { text: value || "—", fontSize: 9, color: INK },
      ]),
    },
    layout: {
      hLineWidth: () => 0.3,
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 0,
      paddingRight: () => 6,
    },
    margin: [0, 0, 0, 8],
  };
}

export function informeFilename(evaluation: Evaluation): string {
  const base = (evaluation.input.title || "trabajo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const day = evaluation.createdAt.slice(0, 10);
  return `Tribunal-${base || "acta"}-${day}.pdf`;
}

export function buildInforme(evaluation: Evaluation) {
  const source =
    evaluation.input.source === "docx"
      ? "Word (.docx)"
      : evaluation.input.source === "pdf"
        ? "PDF"
        : evaluation.input.source === "text"
          ? "Texto plano"
          : "Texto pegado";
  const model =
    evaluation.ai.modelProbability == null
      ? "No disponible"
      : `${evaluation.ai.modelProbability} %`;

  const signalRows: Block[][] = [
    [headCell("Severidad"), headCell("Hallazgo"), headCell("Peso"), headCell("Fundamentación")],
    ...evaluation.forensic.signals.map((signal) => [
      cell(SEVERITY[signal.severity] ?? signal.severity),
      cell(signal.title, { bold: true }),
      cell(signal.weight > 0 ? `+${signal.weight}` : "—"),
      cell(signal.detail),
    ]),
  ];

  const aspectRows: Block[][] = [
    [headCell("Aspecto"), headCell("Puntos"), headCell("Nivel"), headCell("Fundamentación")],
    ...evaluation.rubric.aspects.map((aspect) => [
      cell(`${aspect.name}\n${aspect.descriptor}`, { bold: false }),
      cell(`${aspect.score} / ${aspect.max}`, { bold: true, alignment: "right" }),
      cell(aspect.level),
      cell(aspect.justification),
    ]),
    [
      { text: "Total de contenido", bold: true, fontSize: 9, colSpan: 1 },
      {
        text: `${evaluation.rubric.contentPoints} / ${evaluation.rubric.contentMax}\n${grade(evaluation.rubric.contentGrade)}`,
        bold: true,
        fontSize: 9,
        alignment: "right",
      },
      { text: evaluation.verdict.band, bold: true, fontSize: 9 },
      {
        text:
          evaluation.rubric.source === "modelo"
            ? "Puntajes del modelo, con los topes del reglamento ya aplicados."
            : "Estimación por reglas, porque la lectura del modelo no estuvo disponible.",
        fontSize: 9,
      },
    ],
  ];

  const evidence: Block[] =
    evaluation.ai.evidence.length === 0
      ? [paragraph("No hay pasajes citados por el modelo en esta acta.")]
      : evaluation.ai.evidence.map((item) => ({
          stack: [
            { text: `«${item.quote}»`, italics: true, margin: [8, 2, 0, 1] },
            { text: item.reason, fontSize: 9, color: MUTED, margin: [8, 0, 0, 6] },
          ],
        }));

  const metaRows: Block[][] =
    evaluation.metadata.length === 0
      ? [[cell("No había metadatos que leer.")]]
      : [
          [headCell("Campo"), headCell("Valor")],
          ...evaluation.metadata.map((field) => [cell(field.label, { bold: true }), cell(field.value)]),
        ];

  const content: Block[] = [
    { text: "TRIBUNAL", style: "kicker" },
    { text: "Informe de evaluación", style: "h1", margin: [0, 2, 0, 2] },
    {
      text: `Acta del ${stamp(evaluation.createdAt)} · ${evaluation.verdict.headline}`,
      color: MUTED,
      margin: [0, 0, 0, 10],
    },
    section("1. Datos del trabajo presentado"),
    keyTable([
      ["Título", evaluation.input.title],
      ["Participante", evaluation.input.student || (evaluation.input.fileName ? "No consta en el archivo" : "No indicado")],
      ["De dónde sale el título", evaluation.input.titleSource || "No se leyó del archivo"],
      ["De dónde sale el nombre", evaluation.input.studentSource || "No se leyó del archivo"],
      ["Asignatura", evaluation.input.subject || "No indicada"],
      ["Nivel", LEVEL_LABEL[evaluation.input.level] ?? evaluation.input.level],
      ["Archivo", evaluation.input.fileName || "No aplica"],
      ["Origen", source],
      ["Extensión", `${evaluation.document.wordCount} palabras · ${evaluation.document.charCount} caracteres`],
      ["Páginas", evaluation.document.pageCount ? String(evaluation.document.pageCount) : "No declaradas"],
      [
        "Consigna",
        evaluation.input.brief.trim() ||
          "No se entregó consigna. La pertinencia queda topada en 14 puntos.",
      ],
    ]),
    section("2. Resultado de mesa"),
    keyTable([
      ["Nota institucional", grade(evaluation.verdict.institutionalGrade)],
      ["Nota de contenido", grade(evaluation.rubric.contentGrade)],
      ["Calificación", evaluation.verdict.band],
      ["Dictamen", evaluation.verdict.headline],
      ["Aprueba", evaluation.verdict.passed ? "Sí" : "No"],
    ]),
    paragraph(evaluation.verdict.explanation),
    {
      text:
        evaluation.rubric.kind === "consigna"
          ? "La nota de contenido sale de la rúbrica pegada en la consigna. La nota institucional es la que cuenta: aplica el reglamento de integridad sobre esa matriz. Un texto bien escrito puede quedar en cero si la generación no se sostiene."
          : "La nota de contenido sale de la matriz de cinco aspectos. La nota institucional es la que cuenta: aplica el reglamento de integridad sobre esa matriz. Un texto bien escrito puede quedar en cero si la generación no se sostiene.",
      fontSize: 9,
      color: MUTED,
      margin: [0, 0, 0, 4],
    },
    section("3. Porcentaje de generación con IA"),
    keyTable([
      ["Probabilidad de mesa", `${evaluation.ai.probability} %`],
      ["Indicio forense", `${evaluation.forensic.score} / 100`],
      ["Lectura del modelo", model],
      ["Hallazgo crítico", evaluation.forensic.smokingGun ? "Sí" : "No"],
      ["Origen de la lectura", evaluation.ai.source === "modelo" ? "Modelo, ajustado por el forense" : "Solo forense"],
    ]),
    paragraph(evaluation.ai.summary),
    paragraph(
      "Cómo se fija el porcentaje. El forense suma señales concretas: nombre de una herramienta generativa en los metadatos, tiempo de edición incompatible con la extensión, fechas de creación y modificación casi idénticas, cadencia demasiado pareja, muletillas de prosa generativa y apelaciones a estudios sin cita. El modelo lee el texto y propone su propio porcentaje. La mesa no permite que el modelo absuelva un hallazgo grave: si hay metadato de herramienta generativa, el porcentaje no baja de 90; si el forense ya está en 70 o más, el porcentaje final no puede quedar más de 8 puntos por debajo. Por debajo de 45 no hay sanción. De 45 a 64 se descuentan 2,0 puntos. De 65 a 84 la nota institucional no pasa de 4,0. De 85 en adelante, o con hallazgo crítico, la nota institucional es 0.",
    ),
    { text: "Señales que sostienen el porcentaje", bold: true, margin: [0, 4, 0, 4] },
    {
      table: { headerRows: 1, widths: [58, 110, 36, "*"], body: signalRows },
      layout: tableLayout,
      margin: [0, 0, 0, 8],
    },
    { text: "Pasajes usados como evidencia", bold: true, margin: [0, 2, 0, 4] },
    ...evidence,
    evaluation.modelNote ? paragraph(evaluation.modelNote) : { text: "" },
    section("4. Evaluación académica"),
    paragraph(
      evaluation.rubric.kind === "consigna"
        ? "Los criterios y los puntajes son los de la rúbrica del docente. El nivel es el descriptor que el trabajo alcanza. La nota institucional, aparte, aplica el reglamento de integridad."
        : "Cinco aspectos, veinte puntos cada uno. Diez a trece es un trabajo competente y genérico; dieciocho es excepcional. La originalidad se recorta si el porcentaje de IA es alto, aunque el resto del texto esté bien armado. Sin consigna del docente, la pertinencia no supera 14.",
    ),
    {
      table: { headerRows: 1, widths: [130, 52, 68, "*"], body: aspectRows },
      layout: tableLayout,
      margin: [0, 0, 0, 8],
    },
    section("5. Retroalimentación"),
    { text: "Lo que sostiene el trabajo", bold: true, margin: [0, 0, 0, 3] },
    {
      ul: bullets(
        evaluation.feedback.strengths,
        "Nada que esta mesa pueda llamar un sostén.",
      ),
      margin: [0, 0, 0, 6],
    },
    { text: "Lo que debe corregir", bold: true, margin: [0, 0, 0, 3] },
    {
      ul: bullets(
        evaluation.feedback.improvements,
        "Volver a la consigna y reescribir con fuentes localizables.",
      ),
      margin: [0, 0, 0, 6],
    },
    paragraph(evaluation.feedback.summary),
    section("6. Metadatos examinados"),
    evaluation.metaSynthetic
      ? paragraph(
          "Estos metadatos son de demostración. No se extrajeron de un archivo del estudiante. El informe los trata igual para mostrar el efecto de un hallazgo crítico.",
        )
      : { text: "" },
    {
      table: {
        headerRows: evaluation.metadata.length ? 1 : 0,
        widths: [160, "*"],
        body: metaRows,
      },
      layout: tableLayout,
      margin: [0, 0, 0, 8],
    },
    section("7. Texto sometido a lectura"),
    {
      text: evaluation.document.text || evaluation.document.excerpt || "Sin texto.",
      fontSize: 8,
      color: INK,
      margin: [0, 0, 0, 6],
    },
    evaluation.document.truncated || evaluation.document.modelTruncated
      ? {
          text: [
            evaluation.document.truncated
              ? "El análisis forense usó como máximo los primeros 60.000 caracteres. "
              : "",
            evaluation.document.modelTruncated ? "El modelo vio los primeros 12.000. " : "",
            "Este anexo reproduce el texto guardado en el acta, no necesariamente el archivo entero.",
          ].join(""),
          fontSize: 8,
          color: MUTED,
        }
      : { text: "" },
    {
      text: "Este informe documenta un indicio. No es una prueba pericial ni una sanción por sí solo. La decisión final sigue siendo del docente o de la institución.",
      fontSize: 8,
      color: MUTED,
      margin: [0, 12, 0, 0],
    },
  ];

  return {
    pageSize: "A4",
    pageMargins: [46, 48, 46, 52],
    defaultStyle: { font: "Roboto", fontSize: 10, color: INK, lineHeight: 1.25 },
    styles: {
      kicker: { fontSize: 9, bold: true, color: ACCENT, characterSpacing: 1.2 },
      h1: { fontSize: 22, bold: true, color: ACCENT },
      h2: { fontSize: 13, bold: true, color: ACCENT, margin: [0, 14, 0, 6] },
    },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [46, 8, 46, 0],
      columns: [
        {
          text: "Tribunal · informe de mesa",
          fontSize: 8,
          color: MUTED,
        },
        {
          text: `${currentPage} / ${pageCount}`,
          alignment: "right",
          fontSize: 8,
          color: MUTED,
        },
      ],
    }),
    content,
  };
}
