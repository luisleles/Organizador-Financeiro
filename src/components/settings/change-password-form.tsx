"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { changePasswordAction } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/auth.schema";

export function ChangePasswordForm() {
  const [state, submit, pending] = useActionState(changePasswordAction, IDLE_ACTION_STATE);
  const form = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      form.current?.reset();
    }
    if (state.status === "error" && !state.fieldErrors) notify(state.message, "alerta");
  }, [state, notify]);

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  return (
    <form ref={form} action={submit} className="flex max-w-sm flex-col gap-4">
      <Field label="Senha atual" htmlFor={id("current")} error={errorFor("currentPassword")}>
        <Input
          id={id("current")}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errorFor("currentPassword"))}
          required
        />
      </Field>

      <Field
        label="Nova senha"
        htmlFor={id("new")}
        error={errorFor("newPassword")}
        hint={`Ao menos ${MIN_PASSWORD_LENGTH} caracteres.`}
      >
        <Input
          id={id("new")}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errorFor("newPassword"))}
          required
        />
      </Field>

      <Field
        label="Repita a nova senha"
        htmlFor={id("confirm")}
        error={errorFor("confirmPassword")}
      >
        <Input
          id={id("confirm")}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errorFor("confirmPassword"))}
          required
        />
      </Field>

      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Salvando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
