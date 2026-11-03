import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { Acta } from "@/components/tribunal/acta";
import { previewPathPrefix } from "@/lib/preview-path-prefix";
import {
  SAMPLE_AI,
  SAMPLE_AI_BRIEF,
  SAMPLE_HUMAN,
  SAMPLE_HUMAN_BRIEF,
} from "@/lib/tribunal/samples";
import type { Evaluation, Level } from "@/lib/tribunal/types";

export const Route = createFileRoute("/")({ component: Home });

const HISTORY_KEY = "tribunal-actas-v1";

const RULES = [
  ["Menos de 45", "Sin sanción. La nota institucional es la de contenido."],
  ["45 a 64", "Reserva. Se descuentan 2,0 puntos."],
  ["65 a 84", "Observado. Tope de 4,0. No aprueba."],
  ["85 o más, o metadato de IA", "No acreditable. Nota institucional 0."],
];

type HistoryItem = {
  id: string;
  title: string;
  headline: string;
  grade: number;
  ai: number;
  evaluation: Evaluation;
};

function apiUrl(): string {
  if (typeof window === "undefined") return "/api/evaluate";
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/api/evaluate`;
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fromFile, setFromFile] = useState<{
    title: string;
    student: string;
    titleSource: string;
    studentSource: string;
  } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [text, setText] = useState("");
  const [brief, setBrief] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const actaRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<{ demo: boolean; demoMeta?: string }>({ demo: false });
  const sampleRef = useRef<{ title: string; student: string; subject: string; level: Level }>({
    title: "",
    student: "",
    subject: "",
    level: "pregrado",
  });

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function takeFile(next: File | null) {
    setFile(next);
    setFromFile(null);
    demoRef.current = { demo: false };
    if (!next) return;
    setText("");
    setError("");
    setReadingFile(true);
    try {
      const form = new FormData();
      form.set("file", next);
      form.set("intent", "identify");
      const response = await fetch(apiUrl(), { method: "POST", body: form });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        title?: string;
        student?: string;
        titleSource?: string;
        studentSource?: string;
      };
      if (!response.ok || !body.ok) {
        setError(body.error || "No se pudo leer el título ni el nombre del archivo.");
        return;
      }
      setFromFile({
        title: body.title || "",
        student: body.student || "",
        titleSource: body.titleSource || "",
        studentSource: body.studentSource || "",
      });
    } catch {
      setError("No se pudo leer el título ni el nombre del archivo.");
    } finally {
      setReadingFile(false);
    }
  }

  function remember(next: Evaluation) {
    const item: HistoryItem = {
      id: next.id,
      title: next.input.title,
      headline: next.verdict.headline,
      grade: next.verdict.institutionalGrade,
      ai: next.ai.probability,
      evaluation: {
        ...next,
        document: { ...next.document, text: next.document.text.slice(0, 8000) },
      },
    };
    const stored = [item, ...loadHistory().filter((entry) => entry.id !== item.id)].slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
    setHistory(stored);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    if (!file && text.trim().length < 40) {
      setError("Suba un .docx, un PDF o un .txt, o pegue el trabajo.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.set("file", file);
      else form.set("text", text);
      form.set("title", file ? "" : sampleRef.current.title);
      form.set("student", file ? "" : sampleRef.current.student);
      form.set("subject", file ? "" : sampleRef.current.subject);
      form.set("brief", brief);
      form.set("level", file ? "pregrado" : sampleRef.current.level);
      if (!file && demoRef.current.demo) {
        form.set("demo", "1");
        if (demoRef.current.demoMeta) form.set("demoMeta", demoRef.current.demoMeta);
      }
      demoRef.current = { demo: false };
      const response = await fetch(apiUrl(), { method: "POST", body: form });
      const body = (await response.json()) as { ok: boolean; error?: string; evaluation?: Evaluation };
      if (!response.ok || !body.ok || !body.evaluation) {
        setError(body.error || "No se pudo evaluar.");
        return;
      }
      setEvaluation(body.evaluation);
      remember(body.evaluation);
      requestAnimationFrame(() => {
        actaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setError("La mesa no respondió. Revise el archivo e inténtelo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  function runSample(kind: "ai" | "human") {
    setFile(null);
    setFromFile(null);
    setError("");
    if (kind === "ai") {
      sampleRef.current = {
        title: "El cambio climático y la responsabilidad colectiva",
        student: "Caso de demostración",
        subject: "Ciencias sociales",
        level: "pregrado",
      };
      setBrief(SAMPLE_AI_BRIEF);
      setText(SAMPLE_AI);
      const stamp = new Date().toISOString();
      demoRef.current = {
        demo: true,
        demoMeta: JSON.stringify({
          application: "ChatGPT",
          creator: "ChatGPT",
          producer: "Skia/PDF",
          author: "",
          title: "El cambio climático en la sociedad actual",
          created: stamp,
          modified: stamp,
          totalTimeMinutes: 1,
          revision: "1",
        }),
      };
    } else {
      sampleRef.current = {
        title: "El charco de la cancha, 7º B",
        student: "Caso de demostración",
        subject: "Ciencias naturales",
        level: "secundaria",
      };
      setBrief(SAMPLE_HUMAN_BRIEF);
      setText(SAMPLE_HUMAN);
      demoRef.current = { demo: false };
    }
  }

  return (
    <main className="min-h-screen">
      <header className="no-print border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:items-end md:justify-between md:px-6 md:py-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-widest text-muted">Mesa de evaluación</p>
            <h1 className="mt-2 font-display text-5xl font-medium tracking-tight text-ink">Tribunal</h1>
            <p className="mt-3 max-w-xl text-base text-muted">
              Recibe un trabajo en Word, PDF o texto. Lee los metadatos, juzga con criterio estricto
              si la prosa parece generada y califica el contenido en una matriz de cinco aspectos.
            </p>
          </div>
          <p className="max-w-xs text-sm text-ink">
            Un metadato de herramienta generativa cierra el acta. La matriz sigue ahí, como
            retroalimentación, no como nota.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.72fr)]">
        <form
          onSubmit={submit}
          className="no-print flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6"
          aria-busy={busy}
        >
          <div>
            <h2 className="font-display text-2xl font-medium">Expediente</h2>
            <p className="mt-1 text-sm text-muted">
              .docx, .pdf o .txt, hasta 3 MB. El título y el nombre se leen del archivo.
            </p>
          </div>

          <label
            htmlFor="trabajo"
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const next = event.dataTransfer.files?.[0];
              if (next) void takeFile(next);
            }}
            className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors duration-150 ${
              dragOver ? "border-accent bg-paper" : "border-line bg-paper"
            }`}
          >
            <Upload className="size-5 text-muted" aria-hidden="true" />
            <span className="text-sm font-medium">
              {file ? file.name : "Soltar el archivo o hacer clic para elegirlo"}
            </span>
            <span className="text-xs text-muted">
              {file ? `${Math.ceil(file.size / 1024)} KB` : "Word, PDF o texto"}
            </span>
            <input
              id="trabajo"
              name="trabajo"
              type="file"
              accept=".docx,.pdf,.txt,.md,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                void takeFile(next);
              }}
            />
          </label>
          {file ? (
            <button
              type="button"
              className="self-start text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
              onClick={() => void takeFile(null)}
            >
              Quitar archivo
            </button>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="texto" className="text-sm font-medium">
              O pegar el texto
            </label>
            <textarea
              id="texto"
              value={text}
              disabled={Boolean(file)}
              onChange={(event) => {
                setText(event.target.value);
                demoRef.current = { demo: false };
                sampleRef.current = { title: "", student: "", subject: "", level: "pregrado" };
              }}
              rows={7}
              placeholder={file ? "El archivo tiene prioridad sobre el texto pegado." : "Pegue aquí el trabajo…"}
              className="min-h-36 rounded-md border border-line bg-surface px-3 py-3 text-sm text-ink placeholder:text-muted disabled:opacity-50"
            />
          </div>

          {file ? (
            <div className="rounded-md border border-line bg-paper px-3 py-3 text-sm">
              <p className="text-xs font-medium tracking-widest text-muted">Leído del archivo</p>
              {readingFile ? (
                <p className="mt-2 text-ink">Leyendo título y participante…</p>
              ) : (
                <dl className="mt-3 flex flex-col gap-2">
                  <div>
                    <dt className="text-muted">Título</dt>
                    <dd className="mt-0.5 text-ink">{fromFile?.title || "No aparece en el archivo."}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Participante</dt>
                    <dd className="mt-0.5 text-ink">{fromFile?.student || "No aparece en el archivo."}</dd>
                  </div>
                  {fromFile?.titleSource || fromFile?.studentSource ? (
                    <p className="text-xs text-muted">
                      {[fromFile.titleSource, fromFile.studentSource].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </dl>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor="consigna" className="text-sm font-medium">
              Consigna del docente
            </label>
            <textarea
              id="consigna"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder="Pegue la consigna o una rúbrica con criterios y puntajes. Si trae una tabla, la matriz usa esos criterios."
              className="rounded-md border border-line bg-surface px-3 py-3 text-sm placeholder:text-muted"
            />
          </div>

          {error ? (
            <p role="alert" className="border border-danger px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Evaluando el expediente…" : "Abrir evaluación"}
          </button>
          {busy ? (
            <div className="h-1 overflow-hidden bg-line" aria-hidden="true">
              <div className="bar-slide h-1 w-1/3 bg-accent" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => runSample("ai")}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium hover:bg-paper disabled:opacity-60"
            >
              <FileText className="size-4" aria-hidden="true" />
              Caso con metadato de IA
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runSample("human")}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-line px-3 text-sm font-medium hover:bg-paper disabled:opacity-60"
            >
              Caso con voz propia
            </button>
          </div>
          <p className="text-xs text-muted">
            Los casos de demostración llenan el formulario. El primero simula un PDF creado por
            ChatGPT en un minuto. Hay que pulsar «Abrir evaluación» para dictaminar.
          </p>
        </form>

        <aside className="no-print flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-display text-2xl font-medium">Reglamento</h2>
            <p className="mt-2 text-sm text-muted">
              Sobre 10. Aprueba desde 6,0, salvo que la integridad lo impida. La matriz no se
              borra: deja de ser la nota.
            </p>
            <dl className="mt-4 flex flex-col gap-3">
              {RULES.map(([band, effect]) => (
                <div key={band} className="border-t border-line pt-3">
                  <dt className="text-sm font-medium">{band}</dt>
                  <dd className="mt-1 text-sm text-muted">{effect}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-medium">En este navegador</h2>
              {history.length > 0 ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1 text-sm text-muted hover:text-ink"
                  onClick={() => {
                    localStorage.removeItem(HISTORY_KEY);
                    setHistory([]);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Borrar
                </button>
              ) : null}
            </div>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Las actas se guardan solo en este dispositivo. No salen de aquí.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEvaluation(item.evaluation);
                        requestAnimationFrame(() => {
                          actaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
                      }}
                      className="flex w-full flex-col rounded-md border border-line px-3 py-3 text-left hover:bg-paper"
                    >
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="mt-1 text-xs text-muted tabular-nums">
                        {item.headline} · {item.grade.toFixed(1).replace(".", ",")} · IA {item.ai}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {evaluation ? (
          <div ref={actaRef} className="scroll-mt-6 lg:col-span-2">
            <Acta evaluation={evaluation} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
