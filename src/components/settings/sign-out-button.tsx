"use client";

import { signOutAction } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm">
        Sair
      </Button>
    </form>
  );
}
