import JSZip from "jszip";
import { getDocumentProxy } from "unpdf";
import type { DocParagraph } from "@/lib/tribunal/identity";
import type { DocumentMeta, MetaField, SourceKind } from "@/lib/tribunal/types";

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

const MAX_TEXT = 80_000;
const MAX_PAGES = 30;

export type Extracted = {
  text: string;
  meta: DocumentMeta;
  pageCount?: number;
  paragraphs: DocParagraph[];
};

function emptyMeta(source: SourceKind, fileName?: string, fileBytes?: number): DocumentMeta {
  return {
    source,
    fileName,
    fileBytes,
    custom: [],
    extras: [],
    synthetic: false,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&");
}

function tagText(xml: string, localName: string): string | undefined {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "i",
  );
  const match = xml.match(re);
  if (!match) return undefined;
  const value = decodeXml(match[1].replace(/<[^>]+>/g, "")).trim();
  return value || undefined;
}

function docxParagraphs(xml: string): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  const pattern = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const style = match[0].match(/<w:pStyle\b[^>]*\bw:val="([^"]+)"/i)?.[1];
    const runs = [...match[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((part) =>
      decodeXml(part[1]),
    );
    const line = runs.join("").replace(/[ \t]+\n/g, "\n").trim();
    if (line) paragraphs.push({ text: line, style });
  }
  if (paragraphs.length === 0) {
    const loose = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((part) =>
      decodeXml(part[1]),
    );
    const joined = loose.join("").trim();
    if (joined) paragraphs.push({ text: joined });
  }
  return paragraphs;
}

function integerOf(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function customProps(xml: string): MetaField[] {
  const fields: MetaField[] = [];
  const pattern = /<property\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/property>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const value = decodeXml(match[2].replace(/<[^>]+>/g, "")).trim();
    if (!value) continue;
    fields.push({ label: `Propiedad: ${decodeXml(match[1])}`, value: value.slice(0, 240) });
    if (fields.length >= 16) break;
  }
  return fields;
}

async function extractDocx(bytes: Uint8Array, fileName?: string): Promise<Extracted> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ExtractError("El archivo parece un Word dañado o no es un .docx.");
  }
  const names = Object.keys(zip.files);
  if (names.length > 500) {
    throw new ExtractError("El .docx tiene demasiadas partes internas. No se abre.");
  }
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new ExtractError(
      "No es un .docx legible. Si es un .doc antiguo, ábralo en Word y guárdelo como .docx.",
    );
  }
  const documentXml = await documentFile.async("string");
  if (documentXml.length > 8_000_000) {
    throw new ExtractError("El documento es demasiado grande para leerlo aquí.");
  }
  const paragraphs = docxParagraphs(documentXml);
  const extraBits: string[] = [];
  for (const name of names) {
    if (!/^word\/(header|footer|footnotes|endnotes|comments)\d*\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    if (xml.length > 400_000) continue;
    const text = docxParagraphs(xml)
      .map((paragraph) => paragraph.text)
      .join(" ");
    if (text.trim()) extraBits.push(text.trim());
  }
  const coreXml = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
  const appXml = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
  const customXml = (await zip.file("docProps/custom.xml")?.async("string")) ?? "";
  const meta = emptyMeta("docx", fileName, bytes.byteLength);
  meta.title = tagText(coreXml, "title");
  meta.author = tagText(coreXml, "creator");
  meta.lastModifiedBy = tagText(coreXml, "lastModifiedBy");
  meta.subject = tagText(coreXml, "subject");
  meta.description = tagText(coreXml, "description");
  meta.keywords = tagText(coreXml, "keywords");
  meta.revision = tagText(coreXml, "revision");
  meta.created = tagText(coreXml, "created");
  meta.modified = tagText(coreXml, "modified");
  meta.application = tagText(appXml, "Application");
  meta.appVersion = tagText(appXml, "AppVersion");
  meta.company = tagText(appXml, "Company");
  meta.template = tagText(appXml, "Template");
  meta.totalTimeMinutes = integerOf(tagText(appXml, "TotalTime"));
  meta.pages = integerOf(tagText(appXml, "Pages"));
  meta.declaredWords = integerOf(tagText(appXml, "Words"));
  meta.custom = customProps(customXml);
  if (extraBits.length) {
    const side = extraBits.join(" \n ").slice(0, 500);
    meta.extras.push({ label: "Encabezados, notas o comentarios", value: side });
  }
  const text = paragraphs
    .map((paragraph) => paragraph.text)
    .join("\n\n")
    .slice(0, MAX_TEXT)
    .trim();
  if (text.length < 40) {
    throw new ExtractError("El Word casi no tiene texto. Si son imágenes escaneadas, esta mesa no las lee.");
  }
  return { text, meta, pageCount: meta.pages, paragraphs };
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text || undefined;
}

function readXmp(metadata: unknown): MetaField[] {
  if (!metadata || typeof metadata !== "object" || !(Symbol.iterator in metadata)) return [];
  const fields: MetaField[] = [];
  try {
    for (const pair of metadata as Iterable<[unknown, unknown]>) {
      const label = String(pair[0] ?? "").trim();
      const value = asString(pair[1]);
      if (!label || !value || value.length > 400) continue;
      fields.push({ label, value: value.slice(0, 240) });
      if (fields.length >= 20) break;
    }
  } catch {
    return fields;
  }
  return fields;
}

async function extractPdf(bytes: Uint8Array, fileName?: string): Promise<Extracted> {
  const pdf = await getDocumentProxy(bytes);
  try {
    const pageCount = pdf.numPages;
    const readPages = Math.min(pageCount, MAX_PAGES);
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= readPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => {
          if (!("str" in item) || typeof item.str !== "string") return "";
          return item.str + (item.hasEOL ? "\n" : "");
        })
        .join("");
      if (line.trim()) chunks.push(line.trim());
    }
    const rawMeta = await pdf.getMetadata();
    const info = (rawMeta.info ?? {}) as Record<string, unknown>;
    const xmp = readXmp(rawMeta.metadata);
    const meta = emptyMeta("pdf", fileName, bytes.byteLength);
    meta.title = asString(info.Title);
    meta.author = asString(info.Author);
    meta.subject = asString(info.Subject);
    meta.keywords = asString(info.Keywords);
    meta.creator = asString(info.Creator);
    meta.producer = asString(info.Producer);
    meta.created = asString(info.CreationDate);
    meta.modified = asString(info.ModDate);
    meta.pages = pageCount;
    const creatorTool = xmp.find((field) => /creatortool/i.test(field.label))?.value;
    meta.application = creatorTool || meta.creator;
    const xmpCreated = xmp.find((field) => /createdate/i.test(field.label))?.value;
    const xmpModified = xmp.find((field) => /modifydate/i.test(field.label))?.value;
    if (!meta.created && xmpCreated) meta.created = xmpCreated;
    if (!meta.modified && xmpModified) meta.modified = xmpModified;
    meta.extras = xmp.filter((field) => !/createdate|modifydate|metadatadate/i.test(field.label));
    let text = chunks.join("\n\n").replace(/[^\S\n]+/g, " ").trim();
    if (pageCount > readPages) {
      text += `\n\n[Se leyeron ${readPages} de ${pageCount} páginas.]`;
    }
    text = text.slice(0, MAX_TEXT).trim();
    if (text.length < 40) {
      throw new ExtractError(
        "El PDF no tiene texto seleccionable. Si es un escaneo, hace falta un archivo con texto, no solo imagen.",
      );
    }
    return { text, meta, pageCount, paragraphs: paragraphsFromText(text) };
  } finally {
    await pdf.cleanup();
    await pdf.loadingTask.destroy();
  }
}

function extractPlain(bytes: Uint8Array, fileName: string | undefined, source: SourceKind): Extracted {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const broken = (text.match(/\uFFFD/g) ?? []).length;
  if (broken > 6) text = new TextDecoder("windows-1252").decode(bytes);
  text = text.replace(/^\uFEFF/, "").slice(0, MAX_TEXT).trim();
  if (text.length < 40) {
    throw new ExtractError("El texto es demasiado corto para abrir un acta.");
  }
  return { text, meta: emptyMeta(source, fileName, bytes.byteLength), paragraphs: paragraphsFromText(text) };
}

export async function extractUpload(bytes: Uint8Array, fileName: string): Promise<Extracted> {
  if (bytes.byteLength === 0) throw new ExtractError("El archivo está vacío.");
  if (bytes.byteLength > 3_000_000) {
    throw new ExtractError("El archivo pasa de 3 MB. Recorte anexos o exporte solo el trabajo.");
  }
  const head = bytes.subarray(0, 8);
  const ole = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (ole || /\.doc$/i.test(fileName)) {
    if (!/\.docx$/i.test(fileName)) {
      throw new ExtractError("Los .doc antiguos no se leen. Guárdelo como .docx y vuelva a subirlo.");
    }
  }
  const pdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  if (pdf || /\.pdf$/i.test(fileName)) {
    try {
      return await extractPdf(bytes, fileName);
    } catch (error) {
      if (error instanceof ExtractError) throw error;
      throw new ExtractError("No se pudo leer el PDF. Puede estar protegido o dañado.");
    }
  }
  if (zip || /\.docx$/i.test(fileName)) {
    return extractDocx(bytes, fileName);
  }
  if (/\.(txt|md|text|markdown)$/i.test(fileName) || !fileName.includes(".")) {
    return extractPlain(bytes, fileName, "text");
  }
  throw new ExtractError("Formato no admitido. Use .docx, .pdf o .txt.");
}

export function extractPasted(text: string): Extracted {
  const clean = text.replace(/^\uFEFF/, "").slice(0, MAX_TEXT).trim();
  if (clean.length < 40) {
    throw new ExtractError("Pegue al menos un párrafo. Con menos texto la mesa no abre acta.");
  }
  return { text: clean, meta: emptyMeta("paste"), paragraphs: paragraphsFromText(clean) };
}

function paragraphsFromText(text: string): DocParagraph[] {
  const rows: DocParagraph[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const style = /^#\s+\S/.test(line) ? "Heading1" : /^#{2,6}\s+\S/.test(line) ? "Heading2" : undefined;
    rows.push({ text: line, style });
    if (rows.length >= 80) break;
  }
  return rows;
}
