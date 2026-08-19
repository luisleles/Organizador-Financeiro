"use client";

import { ErrorState } from "@/components/ui/error-state";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: ErrorProps) {
  return (
    <ErrorState
      description={error.message || "Algo quebrou ao montar esta tela."}
      onRetry={reset}
    />
  );
}
