import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleEvaluateRequest } = await import("@/lib/tribunal/handle.server");
        return handleEvaluateRequest(request);
      },
    },
  },
});
