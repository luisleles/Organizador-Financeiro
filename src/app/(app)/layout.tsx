import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { runDueRecurrences } from "@/server/recurrences/recurrence.runner";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  await runDueRecurrences();

  return <AppShell>{children}</AppShell>;
}
