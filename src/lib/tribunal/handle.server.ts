import { evaluateForm } from "@/lib/tribunal/desk";

export async function handleEvaluateRequest(request: Request): Promise<Response> {
  const form = await request.formData();
  const result = await evaluateForm(form);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  if (result.evaluation) return Response.json({ ok: true, evaluation: result.evaluation });
  return Response.json({
    ok: true,
    title: result.title,
    student: result.student,
    titleSource: result.titleSource,
    studentSource: result.studentSource,
  });
}
