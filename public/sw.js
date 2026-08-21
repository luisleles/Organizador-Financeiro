/**
 * Service worker mínimo, e mínimo aqui é uma regra de segurança, não preguiça.
 *
 * O que entra em cache: o shell do app — a tela de sem conexão e os arquivos estáticos que
 * o Next versiona por hash. Nada mais.
 *
 * O que NUNCA entra em cache: qualquer resposta de navegação, de Server Action, de rota de
 * API ou do Auth.js. São dados financeiros e respostas autenticadas; guardá-las no disco do
 * navegador significaria que o saldo de quem já saiu da sessão continua legível, e que uma
 * página de outra sessão poderia ser servida de volta.
 */
const VERSAO = "v1";
const SHELL = `shell-${VERSAO}`;
const ESTATICOS = `estaticos-${VERSAO}`;
const OFFLINE = "/sem-conexao";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE, "/icones/icone-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((chave) => !chave.endsWith(VERSAO)).map((chave) => caches.delete(chave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function ehEstaticoVersionado(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icones/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Estático versionado por hash: o conteúdo nunca muda para a mesma URL, então cache
  // primeiro é seguro e é o que faz o app abrir rápido no 4G do celular.
  if (ehEstaticoVersionado(url)) {
    event.respondWith(
      caches.match(request).then(
        (guardado) =>
          guardado ??
          fetch(request).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              caches.open(ESTATICOS).then((cache) => cache.put(request, copia));
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  // Navegação: sempre rede. Sem internet, a tela de sem conexão — nunca uma página
  // financeira guardada de antes.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  }

  // Todo o resto (rotas de API, Server Actions, dados) passa direto, sem cache.
});
