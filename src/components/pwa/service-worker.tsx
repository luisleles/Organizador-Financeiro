"use client";

import { useEffect } from "react";

/**
 * Registra o service worker depois que a página já está de pé — registrar durante o load
 * competiria por banda com o que a pessoa veio ver.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((erro) => {
        console.error("Falha ao registrar o service worker", erro);
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
