import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import type { Evaluation, Outcome, SignalSeverity } from "@/lib/tribunal/types";
import { LEVEL_LABEL } from "@/lib/tribunal/types";

function grade(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

const OUTCOME_CLASS: Record<Outcome, string> = {
  rechazado: "text-danger",
  observado: "text-warn",
  "aprobado-reserva": "text-warn",
  aprobado: "text-ok",
  insuficiente: "text-ink",
};

const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
  info: "Nota",
};

const SEVERITY_CLASS: Record<SignalSeverity, string> = {
  critical: "border-danger text-danger",
  high: "border-warn text-warn",
  medium: "border-accent text-ink",
  low: "border-line text-muted",
  info: "border-line text-muted",
};

export function Acta({ evaluation }: { evaluation: Evaluation }) {
  const when = format(new Date(evaluation.createdAt), "d MMM yyyy, HH:mm", { locale: es });
  const tone = OUTCOME_CLASS[evaluation.verdict.outcome];
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  async function savePdf() {
    setPdfError("");
    setPdfBusy(true);
    try {
      const { downloadInforme } = await import("@/lib/tribunal/download-report");
      await downloadInforme(evaluation);
    } catch {
      setPdfError("No se pudo armar el PDF. Inténtelo de nuevo.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <article className="acta acta-rise border border-line bg-surface p-6 md:p-8 rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted">Acta de mesa</p>
          <h2 className={`mt-2 font-display text-4xl font-medium tracking-tight ${tone}`}>
            {evaluation.verdict.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{evaluation.verdict.explanation}</p>
          <p className="mt-2 max-w-2xl text-xs text-muted">
            El PDF guarda los datos del trabajo, la matriz de cinco aspectos y el porcentaje de IA,
            con la fundamentación de cada señal.
          </p>
        </div>
        <div className="no-print flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={() => void savePdf()}
            disabled={pdfBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden="true" />
            {pdfBusy ? "Armando PDF…" : "Descargar informe PDF"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-paper"
          >
            <Printer className="size-4" aria-hidden="true" />
            Imprimir
          </button>
          {pdfError ? <p className="text-sm text-danger">{pdfError}</p> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:items-end">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted">Nota institucional</p>
          <p className={`mt-1 font-display text-6xl font-medium tabular-nums tracking-tight ${tone}`}>
            {grade(evaluation.verdict.institutionalGrade)}
            <span className="ml-1 text-2xl text-muted">/10</span>
          </p>
          <p className="mt-1 text-sm text-muted">{evaluation.verdict.band}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Contenido</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums">
              {grade(evaluation.rubric.contentGrade)}
              <span className="text-base text-muted"> /10</span>
            </dd>
            <dd className="text-xs text-muted">{evaluation.rubric.contentPoints}/100 en la matriz</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Probabilidad de IA</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums">{evaluation.ai.probability}</dd>
            <dd className="text-xs text-muted">de mesa, 0 a 100</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Indicio forense</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums">{evaluation.forensic.score}</dd>
            <dd className="text-xs text-muted">
              {evaluation.ai.modelProbability == null
                ? "sin lectura del modelo"
                : `modelo: ${evaluation.ai.modelProbability}`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 h-1 bg-line" aria-hidden="true">
        <div
          className="h-1 bg-accent"
          style={{ width: `${evaluation.ai.probability}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-ink">{evaluation.ai.summary}</p>
      <p className="mt-2 text-xs text-muted">
        La mesa no deja que el modelo absuelva un hallazgo grave: si el forense ya es alto, la
        probabilidad final no puede caer muy por debajo. La matriz mide el texto; la nota
        institucional aplica el reglamento de integridad.
      </p>
      {evaluation.modelNote ? (
        <p className="mt-3 border border-line px-3 py-2 text-sm text-ink">{evaluation.modelNote}</p>
      ) : null}

      <header className="mt-8 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted">Trabajo. </span>
          {evaluation.input.title}
        </p>
        <p>
          <span className="text-muted">Estudiante. </span>
          {evaluation.input.student || "No indicado"}
        </p>
        <p>
          <span className="text-muted">Asignatura. </span>
          {evaluation.input.subject || "No indicada"}
        </p>
        <p>
          <span className="text-muted">Nivel. </span>
          {LEVEL_LABEL[evaluation.input.level]}
        </p>
        <p>
          <span className="text-muted">Fecha de mesa. </span>
          <span className="tabular-nums">{when}</span>
        </p>
        <p>
          <span className="text-muted">Extensión. </span>
          <span className="tabular-nums">
            {evaluation.document.wordCount} palabras
            {evaluation.document.pageCount ? ` · ${evaluation.document.pageCount} pág.` : ""}
          </span>
        </p>
      </header>
      {evaluation.input.brief ? (
        <p className="mt-4 text-sm text-muted">
          <span className="text-ink">Consigna. </span>
          {evaluation.input.brief}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No se entregó consigna. La pertinencia queda topada.
        </p>
      )}

      <section className="mt-8">
        <h3 className="font-display text-2xl font-medium">Matriz de cinco aspectos</h3>
        <p className="mt-1 text-sm text-muted">
          Cada aspecto vale 20. La suma es la nota de contenido.{" "}
          {evaluation.rubric.source === "modelo"
            ? "Justificado por el modelo y corregido por el reglamento."
            : "Estimación por reglas, sin modelo."}
        </p>
        <div className="mt-4 border-t border-line" role="table" aria-label="Matriz de evaluación">
          <div
            role="row"
            className="hidden border-b border-line py-2 text-xs font-medium tracking-wide text-muted md:grid md:grid-cols-[minmax(0,1.2fr)_4.5rem_6.5rem_minmax(0,1.6fr)] md:gap-4"
          >
            <span role="columnheader">Aspecto</span>
            <span role="columnheader">Puntos</span>
            <span role="columnheader">Nivel</span>
            <span role="columnheader">Lectura</span>
          </div>
          {evaluation.rubric.aspects.map((aspect) => (
            <div
              key={aspect.id}
              role="row"
              className="grid gap-2 border-b border-line py-4 md:grid-cols-[minmax(0,1.2fr)_4.5rem_6.5rem_minmax(0,1.6fr)] md:gap-4"
            >
              <div role="cell">
                <p className="font-medium">{aspect.name}</p>
                <p className="mt-1 text-sm text-muted">{aspect.descriptor}</p>
                <div className="mt-3 h-1 bg-line md:max-w-48" aria-hidden="true">
                  <div className="h-1 bg-accent" style={{ width: `${(aspect.score / 20) * 100}%` }} />
                </div>
              </div>
              <p role="cell" className="font-display text-2xl tabular-nums md:text-xl">
                {aspect.score}
                <span className="text-sm text-muted">/20</span>
              </p>
              <p role="cell" className="text-sm">
                {aspect.level}
              </p>
              <p role="cell" className="text-sm text-ink">
                {aspect.justification}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-display text-2xl font-medium">Control de generación</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {evaluation.forensic.signals.map((signal) => (
            <li key={signal.id} className={`border-l-2 pl-3 ${SEVERITY_CLASS[signal.severity]}`}>
              <p className="text-xs font-medium tracking-wide">
                {SEVERITY_LABEL[signal.severity]}
                {signal.weight > 0 ? <span className="tabular-nums"> · +{signal.weight}</span> : null}
              </p>
              <p className="mt-1 font-medium text-ink">{signal.title}</p>
              <p className="mt-1 text-sm text-muted">{signal.detail}</p>
            </li>
          ))}
        </ul>
        {evaluation.ai.evidence.length > 0 ? (
          <div className="mt-6">
            <h4 className="text-sm font-medium">Pasajes que el modelo usó</h4>
            <ul className="mt-3 flex flex-col gap-3">
              {evaluation.ai.evidence.map((item) => (
                <li key={item.quote} className="rounded-md bg-paper px-3 py-3">
                  <p className="font-display text-lg italic">«{item.quote}»</p>
                  <p className="mt-1 text-sm text-muted">{item.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="font-display text-2xl font-medium">Lo que sostiene</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {evaluation.feedback.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-display text-2xl font-medium">Lo que debe corregir</h3>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {evaluation.feedback.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <p className="mt-4 text-sm text-ink">{evaluation.feedback.summary}</p>

      <section className="mt-8">
        <h3 className="font-display text-2xl font-medium">Metadatos del archivo</h3>
        {evaluation.metadata.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No había metadatos que leer.</p>
        ) : (
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {evaluation.metadata.map((field) => (
              <div key={`${field.label}-${field.value}`} className="border-t border-line pt-2">
                <dt className="text-xs text-muted">{field.label}</dt>
                <dd className="mt-1 text-sm break-words">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <details className="mt-8 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium">Texto leído</summary>
        <p className="mt-3 text-sm whitespace-pre-wrap text-ink">{evaluation.document.text}</p>
        {evaluation.document.truncated || evaluation.document.modelTruncated ? (
          <p className="mt-3 text-xs text-muted">
            {evaluation.document.truncated
              ? "El análisis forense usó los primeros 60.000 caracteres. "
              : ""}
            {evaluation.document.modelTruncated
              ? "El modelo vio los primeros 12.000."
              : ""}
          </p>
        ) : null}
      </details>
    </article>
  );
}
