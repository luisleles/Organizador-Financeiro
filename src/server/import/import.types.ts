import type { ImportPreview } from "./import.pipeline";

/**
 * Estado da revisão na tela. Mora aqui, e não junto das Server Actions, porque um módulo
 * `"use server"` só pode exportar funções assíncronas — uma constante exportada de lá vira
 * referência de função remota e explode no primeiro render.
 */
export type PreviewState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: ImportPreview };

export const IDLE_PREVIEW: PreviewState = { status: "idle" };
