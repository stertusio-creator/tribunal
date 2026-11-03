export const LEVELS = ["secundaria", "pregrado", "posgrado"] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  secundaria: "Secundaria",
  pregrado: "Pregrado",
  posgrado: "Posgrado",
};

export type SourceKind = "docx" | "pdf" | "text" | "paste";

export type SignalSeverity = "critical" | "high" | "medium" | "low" | "info";

export type Signal = {
  id: string;
  severity: SignalSeverity;
  weight: number;
  title: string;
  detail: string;
};

export type MetaField = {
  label: string;
  value: string;
};

export type DocumentMeta = {
  source: SourceKind;
  fileName?: string;
  fileBytes?: number;
  title?: string;
  author?: string;
  lastModifiedBy?: string;
  application?: string;
  appVersion?: string;
  producer?: string;
  creator?: string;
  company?: string;
  template?: string;
  created?: string;
  modified?: string;
  revision?: string;
  totalTimeMinutes?: number;
  pages?: number;
  declaredWords?: number;
  keywords?: string;
  subject?: string;
  description?: string;
  custom: MetaField[];
  extras: MetaField[];
  /** True when the caller supplied demonstration metadata, not a real file. */
  synthetic: boolean;
};

export type TextStats = {
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentenceWords: number;
  sentenceLengthCv: number;
  transitionHits: { phrase: string; count: number }[];
  transitionTotal: number;
  citationCount: number;
  urlCount: number;
  bibliographyLikely: boolean;
  firstPerson: number;
  digitGroups: number;
  markdownResidue: boolean;
  unbackedStudies: boolean;
  rigidSkeleton: boolean;
};

export type ForensicReport = {
  score: number;
  smokingGun: boolean;
  signals: Signal[];
  stats: TextStats;
};

export type AspectId =
  | "pertinencia"
  | "argumentacion"
  | "evidencia"
  | "estructura"
  | "originalidad";

export type AspectScore = {
  id: string;
  name: string;
  descriptor: string;
  score: number;
  max: number;
  level: string;
  justification: string;
};

export type Outcome =
  | "aprobado"
  | "aprobado-reserva"
  | "insuficiente"
  | "observado"
  | "rechazado";

export type Integrity = "limpia" | "reserva" | "observada" | "rechazada";

export type Evaluation = {
  id: string;
  createdAt: string;
  input: {
    title: string;
    student: string;
    titleSource?: string;
    studentSource?: string;
    subject: string;
    level: Level;
    brief: string;
    fileName?: string;
    source: SourceKind;
  };
  document: {
    wordCount: number;
    charCount: number;
    pageCount?: number;
    excerpt: string;
    text: string;
    truncated: boolean;
    modelTruncated: boolean;
  };
  metadata: MetaField[];
  metaSynthetic: boolean;
  forensic: ForensicReport;
  ai: {
    probability: number;
    modelProbability: number | null;
    summary: string;
    evidence: { quote: string; reason: string }[];
    source: "modelo" | "forense";
  };
  rubric: {
    source: "modelo" | "estimacion";
    kind: "mesa" | "consigna";
    aspects: AspectScore[];
    contentPoints: number;
    contentMax: number;
    contentGrade: number;
  };
  verdict: {
    institutionalGrade: number;
    outcome: Outcome;
    integrity: Integrity;
    passed: boolean;
    headline: string;
    explanation: string;
    band: string;
  };
  feedback: {
    summary: string;
    strengths: string[];
    improvements: string[];
  };
  modelNote?: string;
};
