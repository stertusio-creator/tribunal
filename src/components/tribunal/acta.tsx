import { Download } from "lucide-react";
import { useState } from "react";
import type { Evaluation, Outcome } from "@/lib/tribunal/types";

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

export function Acta({ evaluation }: { evaluation: Evaluation }) {
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted">Informe</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight">
            {evaluation.input.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {evaluation.input.student || "Participante no consta en el archivo"}
            {evaluation.document.wordCount ? ` · ${evaluation.document.wordCount} palabras` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void savePdf()}
          disabled={pdfBusy}
          className="no-print inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden="true" />
          {pdfBusy ? "Armando PDF…" : "Descargar informe"}
        </button>
      </div>
      {pdfError ? <p className="no-print mt-2 text-sm text-danger">{pdfError}</p> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-paper p-5">
          <p className="text-xs font-medium tracking-widest text-muted">Nota del trabajo</p>
          <p className="mt-2 font-display text-5xl font-medium tabular-nums">
            {grade(evaluation.rubric.contentGrade)}
            <span className="ml-1 text-xl text-muted">/10</span>
          </p>
          <p className="mt-1 text-sm text-muted">{evaluation.verdict.band}</p>
        </section>
        <section className="rounded-xl border border-line bg-paper p-5">
          <p className="text-xs font-medium tracking-widest text-muted">
            Probabilidad de que lo escribió una IA
          </p>
          <p className={`mt-2 font-display text-5xl font-medium tabular-nums ${tone}`}>
            {evaluation.ai.probability}
            <span className="ml-1 text-xl">%</span>
          </p>
          <p className={`mt-1 text-sm ${tone}`}>{evaluation.verdict.headline}</p>
          <p className="mt-2 text-sm text-ink">
            El número va de la IA, no del alumno. 100 % sería casi seguro escrito por una IA. 0 %
            sería casi seguro escrito por el alumno.
          </p>
        </section>
      </div>

      <section className="mt-8">
        <h3 className="font-display text-2xl font-medium">Por qué esta nota</h3>
        <p className="mt-3 text-base text-ink">
          {evaluation.feedback.summary || "La nota sale de lo que el texto logra frente a lo pedido."}
        </p>
        <ul className="mt-4 flex flex-col gap-4">
          {evaluation.rubric.aspects.map((aspect) => (
            <li key={aspect.id} className="border-t border-line pt-3">
              <p className="font-medium">
                {aspect.name}
                <span className="ml-2 tabular-nums text-muted">
                  {aspect.score}/{aspect.max}
                  {aspect.level ? ` · ${aspect.level}` : ""}
                </span>
              </p>
              <p className="mt-1 text-sm text-ink">{aspect.justification}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h3 className="font-display text-2xl font-medium">Por qué esta probabilidad de IA</h3>
        <p className="mt-3 text-base text-ink">{evaluation.ai.summary || evaluation.verdict.explanation}</p>
        {evaluation.ai.summary ? (
          <p className="mt-2 text-sm text-muted">{evaluation.verdict.explanation}</p>
        ) : null}
        <ol className="mt-4 flex flex-col gap-4">
          {evaluation.forensic.signals.map((signal, index) => (
            <li key={signal.id} className="border-t border-line pt-3">
              <p className="font-medium">
                {index + 1}. {signal.title}
              </p>
              <p className="mt-1 text-sm text-ink">{signal.detail}</p>
            </li>
          ))}
        </ol>
        {evaluation.ai.evidence.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {evaluation.ai.evidence.map((item) => (
              <li key={item.quote} className="rounded-md bg-paper px-3 py-3">
                <p className="font-display text-lg italic">«{item.quote}»</p>
                <p className="mt-1 text-sm text-ink">{item.reason}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {evaluation.modelNote ? <p className="mt-4 text-sm text-muted">{evaluation.modelNote}</p> : null}
      </section>

      <details className="mt-8 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium">Datos del archivo y texto leído</summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {evaluation.metadata.map((field) => (
            <div key={`${field.label}-${field.value}`}>
              <dt className="text-xs text-muted">{field.label}</dt>
              <dd className="text-sm break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm whitespace-pre-wrap text-ink">{evaluation.document.text}</p>
      </details>
    </article>
  );
}
