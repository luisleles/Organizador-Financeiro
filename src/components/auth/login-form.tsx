"use client";

import { useActionState, useId } from "react";
import { createFirstUserAction, signInAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/auth.schema";

type LoginFormProps = {
  primeiraExecucao: boolean;
  destino: string;
};

export function LoginForm({ primeiraExecucao, destino }: LoginFormProps) {
  const [state, submit, pending] = useActionState(
    primeiraExecucao ? createFirstUserAction : signInAction,
    IDLE_ACTION_STATE,
  );
  const fieldId = useId();

  const submitted = state.status === "error" ? state.values : undefined;
  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  return (
    <form action={submit} className="flex flex-col gap-4">
      <input type="hidden" name="destino" value={destino} />

      {primeiraExecucao && (
        <Field label="Nome" htmlFor={id("name")} error={errorFor("name")}>
          <Input
            id={id("name")}
            name="name"
            autoComplete="name"
            defaultValue={submitted?.name ?? ""}
            invalid={Boolean(errorFor("name"))}
            required
          />
        </Field>
      )}

      <Field label="E-mail" htmlFor={id("email")} error={errorFor("email")}>
        <Input
          id={id("email")}
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={submitted?.email ?? ""}
          invalid={Boolean(errorFor("email"))}
          required
          autoFocus={!primeiraExecucao}
        />
      </Field>

      <Field
        label="Senha"
        htmlFor={id("password")}
        error={errorFor("password")}
        hint={primeiraExecucao ? `Ao menos ${MIN_PASSWORD_LENGTH} caracteres.` : undefined}
      >
        <Input
          id={id("password")}
          name="password"
          type="password"
          autoComplete={primeiraExecucao ? "new-password" : "current-password"}
          invalid={Boolean(errorFor("password"))}
          required
        />
      </Field>

      {state.status === "error" && !state.fieldErrors && (
        <p role="alert" className="text-alerta text-sm">
          {state.message}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Entrando…" : primeiraExecucao ? "Criar acesso" : "Entrar"}
      </Button>
    </form>
  );
}
