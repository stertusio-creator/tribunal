import { evaluateSubmission, normalizeLevel } from "@/lib/tribunal/evaluate";
import { ExtractError, extractPasted, extractUpload } from "@/lib/tribunal/extract";
import { identifyWork } from "@/lib/tribunal/identity";
import type { DocumentMeta } from "@/lib/tribunal/types";

function textField(form: FormData, key: string, max: number): string {
  const value = form.get(key);
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function applyDemoMeta(meta: DocumentMeta, raw: string): DocumentMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return meta;
  }
  if (!parsed || typeof parsed !== "object") return meta;
  const source = parsed as Record<string, unknown>;
  const str = (key: string) => (typeof source[key] === "string" ? (source[key] as string).slice(0, 180) : undefined);
  const num = (key: string) => (typeof source[key] === "number" ? (source[key] as number) : undefined);
  return {
    ...meta,
    source: "pdf",
    fileName: meta.fileName ?? "demostracion-chatgpt.pdf",
    synthetic: true,
    title: str("title") ?? meta.title,
    author: str("author") ?? meta.author,
    lastModifiedBy: str("lastModifiedBy") ?? meta.lastModifiedBy,
    application: str("application") ?? meta.application,
    producer: str("producer") ?? meta.producer,
    creator: str("creator") ?? meta.creator,
    created: str("created") ?? meta.created,
    modified: str("modified") ?? meta.modified,
    revision: str("revision") ?? meta.revision,
    totalTimeMinutes: num("totalTimeMinutes") ?? meta.totalTimeMinutes,
    company: str("company") ?? meta.company,
  };
}

export async function handleEvaluateRequest(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = textField(form, "text", 80_000);
    const demo = textField(form, "demo", 8) === "1";
    const demoMeta = textField(form, "demoMeta", 2_000);
    let extracted;
    if (file instanceof File && file.size > 0) {
      if (file.size > 3_000_000) {
        throw new ExtractError("El archivo pasa de 3 MB. Recorte anexos o exporte solo el trabajo.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      extracted = await extractUpload(bytes, file.name || "trabajo");
    } else if (pasted.trim()) {
      extracted = extractPasted(pasted);
      if (demo && demoMeta) extracted = { ...extracted, meta: applyDemoMeta(extracted.meta, demoMeta) };
    } else {
      throw new ExtractError("Suba un archivo o pegue el texto del trabajo.");
    }

    const identity = identifyWork(extracted.paragraphs, extracted.meta);
    if (textField(form, "intent", 16) === "identify") {
      return Response.json({
        ok: true,
        title: identity.title,
        student: identity.student,
        titleSource: identity.titleSource,
        studentSource: identity.studentSource,
      });
    }

    const evaluation = await evaluateSubmission({
      text: extracted.text,
      meta: extracted.meta,
      pageCount: extracted.pageCount,
      title: textField(form, "title", 180),
      brief: textField(form, "brief", 12_000),
      level: normalizeLevel(textField(form, "level", 32)),
      subject: textField(form, "subject", 120),
      student: textField(form, "student", 120),
      identity,
    });
    return Response.json({ ok: true, evaluation });
  } catch (error) {
    if (error instanceof ExtractError) {
      return Response.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error(error);
    return Response.json(
      { ok: false, error: "No se pudo cerrar el acta. Inténtelo de nuevo." },
      { status: 500 },
    );
  }
}
