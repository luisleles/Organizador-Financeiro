/** Contrato de retorno das Server Actions, consumido por `useActionState` nos formulários. */
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: FieldErrors;
      /**
       * O que o usuário havia digitado. O React reseta um `<form action>` assim que a
       * action termina, inclusive quando ela recusa a entrada; devolvendo os valores, o
       * formulário os usa como `defaultValue` e o reset repõe exatamente o que foi
       * enviado, em vez de limpar a tela na cara de quem errou um campo.
       */
      values?: Record<string, string>;
    };

export const IDLE_ACTION_STATE: ActionState = { status: "idle" };

export function actionError(
  message: string,
  fieldErrors?: FieldErrors,
  values?: Record<string, string>,
): ActionState {
  return { status: "error", message, fieldErrors, values };
}

export function actionSuccess(message: string): ActionState {
  return { status: "success", message };
}
