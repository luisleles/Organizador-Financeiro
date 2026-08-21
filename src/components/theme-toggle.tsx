"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const stored = document.documentElement.dataset.theme;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("tema", next);
    setTheme(next);
  }

  const alvo = theme === "dark" ? "claro" : "escuro";

  return (
    // O nome acessível precisa conter o texto visível: quem navega por voz pede "clicar
    // claro", e um rótulo que não tem essa palavra deixa o comando sem alvo.
    <Button size="sm" onClick={toggle} aria-label={`Mudar para o tema ${alvo}`}>
      {alvo}
    </Button>
  );
}
