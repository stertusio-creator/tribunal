import { parseRubric } from "@/lib/tribunal/consigna";
import { analyzeForensics } from "@/lib/tribunal/forensics";
import type { WorkIdentity } from "@/lib/tribunal/identity";
import { readWithModel } from "@/lib/tribunal/model";
import {
  applyScorePolicy,
  contentTotals,
  decideVerdict,
  estimateFeedback,
  estimateOnRubric,
  estimateRubric,
  fuseProbability,
} from "@/lib/tribunal/rubric";
import type { DocumentMeta, Evaluation, Level, MetaField } from "@/lib/tribunal/types";
import { LEVELS } from "@/lib/tribunal/types";

const MODEL_CHARS = 12_000;

function rowsOf(meta: DocumentMeta): MetaField[] {
  const rows: MetaField[] = [];
  const push = (label: string, value: string | number | undefined) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    rows.push({ label, value: text.slice(0, 280) });
  };
  const sourceLabel =
    meta.source === "docx"
      ? "Word (.docx)"
      : meta.source === "pdf"
        ? "PDF"
        : meta.source === "text"
          ? "Texto plano"
          : "Texto pegado";
  push("Origen", sourceLabel);
  push("Archivo", meta.fileName);
  if (meta.fileBytes) push("Tamaño", `${Math.ceil(meta.fileBytes / 1024)} KB`);
  push("Título interno", meta.title);
  push("Autor", meta.author || (meta.source === "docx" || meta.source === "pdf" ? "(vacío)" : undefined));
  push("Última modificación por", meta.lastModifiedBy);
  push("Aplicación", meta.application);
  push("Versión", meta.appVersion);
  push("Creador", meta.creator);
  push("Productor", meta.producer);
  push("Compañía", meta.company);
  push("Plantilla", meta.template);
  push("Creado", meta.created);
  push("Modificado", meta.modified);
  push("Revisión", meta.revision);
  if (typeof meta.totalTimeMinutes === "number") {
    push("Tiempo de edición", `${meta.totalTimeMinutes} min`);
  }
  if (meta.pages) push("Páginas", meta.pages);
  if (meta.declaredWords) push("Palabras declaradas", meta.declaredWords);
  push("Asunto", meta.subject);
  push("Palabras clave", meta.keywords);
  push("Descripción", meta.description);
  for (const field of meta.custom) rows.push(field);
  for (const field of meta.extras) rows.push(field);
  if (meta.synthetic) {
    rows.unshift({
      label: "Aviso",
      value: "Metadatos de demostración. No se extrajeron de un archivo del estudiante.",
    });
  }
  return rows;
}

export function normalizeLevel(value: string): Level {
  return LEVELS.includes(value as Level) ? (value as Level) : "pregrado";
}

export async function evaluateSubmission(input: {
  text: string;
  meta: DocumentMeta;
  title: string;
  brief: string;
  level: Level;
  subject: string;
  student: string;
  pageCount?: number;
  identity: WorkIdentity;
}): Promise<Evaluation> {
  const full = input.text.replace(/\u0000/g, "").trim();
  const analyzed = full.slice(0, 60_000);
  const forensic = analyzeForensics(analyzed, input.meta, input.level, input.brief);
  const fromFile = input.meta.source !== "paste";
  const identity = input.identity;
  const fileTitle = (input.meta.fileName ?? "").replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  const title =
    (fromFile && identity.title ? identity.title : input.title.trim() || identity.title) ||
    input.meta.title ||
    fileTitle ||
    "Trabajo sin título";
  const student =
    (fromFile && identity.student ? identity.student : input.student.trim() || identity.student) || "";
  const titleSource = title === identity.title ? identity.titleSource : "";
  const studentSource = student === identity.student ? identity.studentSource : "";
  const teacherRubric = parseRubric(input.brief);
  const modelText = analyzed.slice(0, teacherRubric ? 48_000 : MODEL_CHARS);
  const modelTruncated = analyzed.length > modelText.length;
  const publicPage = import.meta.env.VITE_PAGES === "1";
  let modelNote: string | undefined;
  let reading: Awaited<ReturnType<typeof readWithModel>> = null;
  if (publicPage) {
    modelNote =
      "En esta página pública no hay lectura de modelo. La probabilidad es el puntaje forense y la matriz es una estimación por reglas.";
  } else {
    try {
      reading = await readWithModel({
        text: modelText,
        brief: input.brief,
        level: input.level,
        title,
        subject: input.subject,
        meta: input.meta,
        forensic,
        modelTruncated,
        rubric: teacherRubric,
      });
    } catch (error) {
      console.error("model failed", error);
      reading = null;
    }
    if (!reading) {
      const hasKey = typeof process !== "undefined" && Boolean(process.env?.XAI_API_KEY);
      modelNote = hasKey
        ? "La lectura del modelo no pudo completarse. La probabilidad es el puntaje forense y la matriz es una estimación por reglas."
        : "En este entorno no hay lectura de modelo. La probabilidad es el puntaje forense y la matriz es una estimación por reglas.";
    }
  }

  const probability = fuseProbability(forensic, reading?.probability ?? null);
  const baseAspects = reading?.aspects
    ?? (teacherRubric ? estimateOnRubric(analyzed, teacherRubric) : estimateRubric(analyzed, input.brief, input.level, forensic));
  const aspects = teacherRubric ? baseAspects : applyScorePolicy(baseAspects, input.brief, probability);
  const totals = contentTotals(aspects);
  const verdict = decideVerdict(totals.contentGrade, probability, forensic.smokingGun);
  const fallback = estimateFeedback(aspects, forensic);

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    input: {
      title,
      student,
      titleSource: titleSource || undefined,
      studentSource: studentSource || undefined,
      subject: input.subject.trim(),
      level: input.level,
      brief: input.brief.trim(),
      fileName: input.meta.fileName,
      source: input.meta.source,
    },
    document: {
      wordCount: forensic.stats.words,
      charCount: forensic.stats.chars,
      pageCount: input.pageCount ?? input.meta.pages,
      excerpt: analyzed.slice(0, 700),
      text: analyzed.slice(0, 12_000),
      truncated: full.length > analyzed.length,
      modelTruncated,
    },
    metadata: rowsOf(input.meta),
    metaSynthetic: input.meta.synthetic,
    forensic,
    ai: {
      probability,
      modelProbability: reading?.probability ?? null,
      summary:
        reading?.summary ||
        (forensic.smokingGun
          ? "El archivo trae un hallazgo crítico de generación. La mesa no necesita que el modelo lo confirme para rechazarlo."
          : "Sin lectura del modelo, la probabilidad de mesa es el puntaje forense."),
      evidence: reading?.evidence ?? [],
      source: reading ? "modelo" : "forense",
    },
    rubric: {
      source: reading ? "modelo" : "estimacion",
      kind: teacherRubric ? "consigna" : "mesa",
      aspects,
      contentPoints: totals.contentPoints,
      contentMax: totals.contentMax,
      contentGrade: totals.contentGrade,
    },
    verdict,
    feedback: {
      summary: reading?.feedback || fallback.summary,
      strengths: reading?.strengths?.length ? reading.strengths : fallback.strengths,
      improvements: reading?.improvements?.length ? reading.improvements : fallback.improvements,
    },
    modelNote,
  };
}
