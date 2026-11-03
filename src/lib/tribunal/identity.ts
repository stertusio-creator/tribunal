export type DocParagraph = {
  text: string;
  style?: string;
};

export type WorkIdentity = {
  title: string;
  student: string;
  titleSource: string;
  studentSource: string;
};

const EMPTY: WorkIdentity = { title: "", student: "", titleSource: "", studentSource: "" };

const GENERIC_TITLES = new Set([
  "documento",
  "document",
  "sin titulo",
  "untitled",
  "microsoft word",
  "documento de word",
  "trabajo",
  "ensayo",
  "informe",
]);

const BLOCKED_NAMES = [
  "claude",
  "chatgpt",
  "openai",
  "gemini",
  "copilot",
  "anthropic",
  "microsoft",
  "google",
  "usuario",
  "admin",
  "author",
  "autor",
  "desconocido",
  "estudiante",
  "alumno",
  "participante",
];

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "dos", "van", "von", "di"]);

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function clean(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTitleStyle(style: string | undefined): boolean {
  if (!style) return false;
  const token = fold(style).replace(/[\s_-]+/g, "");
  return token === "title" || token === "titulo" || token === "heading1";
}

function isSectionLabel(value: string): boolean {
  const token = fold(value)
    .replace(/^\d+[\).:\-\s]+/, "")
    .trim();
  return /^(resumen|introduccion|abstract|conclusiones|conclusion|referencias|bibliografia|anexo|indice|contenido|metodologia|marco teorico)/.test(
    token,
  );
}

function looksLikeTitle(value: string): boolean {
  if (value.length < 12 || value.length > 220) return false;
  const words = value.split(/\s+/);
  if (words.length < 3 || words.length > 32) return false;
  if (isSectionLabel(value)) return false;
  if (GENERIC_TITLES.has(fold(value))) return false;
  if (/^https?:/i.test(value)) return false;
  return true;
}

function blockedName(value: string): boolean {
  const token = fold(value);
  return BLOCKED_NAMES.some((needle) => token === needle || token.startsWith(`${needle} `) || token.endsWith(` ${needle}`) || token.includes(` ${needle} `));
}

function personName(value: string, allowSingle: boolean): boolean {
  const text = value.replace(/^@\s*/, "").trim();
  if (text.length < 3 || text.length > 80) return false;
  if (/[0-9@#]|https?:|www\./i.test(text)) return false;
  if (blockedName(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > 6) return false;
  if (words.length < 2 && !allowSingle) return false;
  const nameWord = /^[\p{Lu}][\p{L}'’.-]{1,40}$/u;
  if (!nameWord.test(words[0] ?? "")) return false;
  return words.slice(1).every((word) => PARTICLES.has(fold(word)) || nameWord.test(word));
}

function labelTitle(line: string): string | undefined {
  const match = line.match(/^(?:t[ií]tulo(?:\s+del\s+trabajo)?|title|nombre\s+del\s+trabajo)\s*[:：.\-–]\s*(.+)$/i);
  const value = match?.[1] ? clean(match[1]) : "";
  return value && looksLikeTitle(value) ? value : undefined;
}

function labelName(line: string): string | undefined {
  const match = line.match(
    /^(?:alumn[oa]s?|estudiantes?|participantes?|autora?|nombre(?:\s+completo)?|elaborad[oa]\s+por|presentad[oa]\s+por|realizad[oa]\s+por|integrantes?)\s*[:：.\-–]\s*(.+)$/i,
  );
  const value = match?.[1] ? clean(match[1]).replace(/^@\s*/, "") : "";
  return value && personName(value, true) ? value : undefined;
}

function nameFromLine(line: string): string | undefined {
  const mentioned = line.match(/@\s*([\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){0,4})/u);
  if (mentioned?.[1] && personName(mentioned[1], false)) return mentioned[1];
  const parts = line.split(/\s*[·•|—–]\s*/);
  if (parts.length >= 2) {
    const tail = clean(parts[parts.length - 1] ?? "").replace(/^@\s*/, "");
    if (personName(tail, false)) return tail;
  }
  const credit = line.match(/\b(?:por|by)\s+([\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,4})/u);
  if (credit?.[1] && personName(credit[1], false)) return credit[1];
  return undefined;
}

function titleFromName(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").trim();
  return looksLikeTitle(base) ? base : undefined;
}

function propValue(
  custom: { label: string; value: string }[] | undefined,
  kind: "title" | "name",
): string | undefined {
  for (const field of custom ?? []) {
    const label = fold(field.label);
    const value = clean(field.value);
    if (kind === "title" && /titulo|title|nombre del trabajo/.test(label) && looksLikeTitle(value)) return value;
    if (kind === "name" && /alumno|estudiante|participante|autor|nombre/.test(label) && personName(value, true)) {
      return value;
    }
  }
  return undefined;
}

export function identifyWork(
  paragraphs: DocParagraph[],
  meta: { title?: string; author?: string; fileName?: string; custom?: { label: string; value: string }[] },
): WorkIdentity {
  const head = paragraphs
    .map((paragraph) => ({ text: clean(paragraph.text), style: paragraph.style }))
    .filter((paragraph) => paragraph.text)
    .slice(0, 16);

  let title = "";
  let titleSource = "";
  const styled = head.find(
    (paragraph) => isTitleStyle(paragraph.style) && looksLikeTitle(paragraph.text) && !isSectionLabel(paragraph.text),
  );
  if (styled) {
    title = styled.text;
    titleSource = "Encabezado del documento";
  }
  if (!title) {
    for (const paragraph of head) {
      const labeled = labelTitle(paragraph.text);
      if (labeled) {
        title = labeled;
        titleSource = "Rótulo «Título» en el documento";
        break;
      }
    }
  }
  if (!title) {
    const first = head[0]?.text ?? "";
    const second = head[1]?.text ?? "";
    if (
      looksLikeTitle(first) &&
      !isSectionLabel(first) &&
      (nameFromLine(second) || isSectionLabel(second) || isTitleStyle(head[1]?.style))
    ) {
      title = first;
      titleSource = "Primera línea del documento";
    }
  }
  if (!title) {
    const fromProp = propValue(meta.custom, "title");
    const fromMeta = meta.title ? clean(meta.title) : "";
    if (fromProp) {
      title = fromProp;
      titleSource = "Propiedad del archivo";
    } else if (fromMeta && looksLikeTitle(fromMeta) && !GENERIC_TITLES.has(fold(fromMeta))) {
      title = fromMeta;
      titleSource = "Metadato del archivo";
    }
  }
  if (!title) {
    const fromFile = titleFromName(meta.fileName);
    if (fromFile) {
      title = fromFile;
      titleSource = "Nombre del archivo";
    }
  }

  let student = "";
  let studentSource = "";
  for (const paragraph of head) {
    const labeled = labelName(paragraph.text);
    if (labeled) {
      student = labeled;
      studentSource = "Rótulo del documento";
      break;
    }
  }
  if (!student) {
    for (const paragraph of head.slice(0, 8)) {
      const named = nameFromLine(paragraph.text);
      if (named) {
        student = named;
        studentSource = "Línea de autor del documento";
        break;
      }
    }
  }
  if (!student) {
    const fromProp = propValue(meta.custom, "name");
    const fromMeta = meta.author ? clean(meta.author) : "";
    if (fromProp) {
      student = fromProp;
      studentSource = "Propiedad del archivo";
    } else if (fromMeta && personName(fromMeta, true)) {
      student = fromMeta;
      studentSource = "Metadato de autor";
    }
  }

  if (!title && !student) return EMPTY;
  return {
    title: title.slice(0, 180),
    student: student.slice(0, 120),
    titleSource,
    studentSource,
  };
}
