import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import { buildInforme, informeFilename } from "@/lib/tribunal/report-doc";
import type { Evaluation } from "@/lib/tribunal/types";

let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  pdfMake.addVirtualFileSystem(vfs);
  fontsReady = true;
}

export async function informeBlob(evaluation: Evaluation): Promise<{ blob: Blob; filename: string }> {
  ensureFonts();
  const file = pdfMake.createPdf(buildInforme(evaluation));
  const blob = await file.getBlob();
  return { blob, filename: informeFilename(evaluation) };
}

export async function downloadInforme(evaluation: Evaluation): Promise<void> {
  const { blob, filename } = await informeBlob(evaluation);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
