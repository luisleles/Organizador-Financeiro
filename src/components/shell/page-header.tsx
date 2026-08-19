import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">{title}</h1>
        <p className="text-md text-texto-fraco max-w-xl">{description}</p>
      </div>
      {action}
    </header>
  );
}
