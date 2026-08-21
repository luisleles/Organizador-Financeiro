# Controle Financeiro

Aplicação web de controle financeiro pessoal, para uso individual e local. Não há
autenticação nem multiusuário: é uma ferramenta para uma única pessoa acompanhar suas
próprias finanças.

## Stack

- [Next.js 15](https://nextjs.org/) (App Router) com TypeScript em modo strict
- [Prisma](https://www.prisma.io/) + SQLite
- [Tailwind CSS](https://tailwindcss.com/)
- Docker Compose para desenvolvimento e produção

Valores monetários são sempre armazenados como inteiros em centavos. Datas ficam em UTC
no banco e são exibidas no fuso `America/Sao_Paulo`. Moeda: BRL.

## Estrutura de pastas

```
src/app        rotas e páginas (Next.js App Router)
src/components componentes de UI
src/lib        utilitários (formatação de moeda, datas, prisma client)
src/server     camada de serviço e regras de negócio
prisma         schema, migrations e seed
```

## Abrindo com um clique (Linux)

`scripts/abrir-app.sh` faz tudo sozinho: instala dependências se faltarem, aplica as
migrations, gera os dados de exemplo num banco novo, compila só quando algum arquivo
mudou desde a última build, sobe o servidor e abre o navegador. Se o app já estiver no ar,
ele apenas abre a aba. O atalho roda sem terminal, então o andamento aparece nas
notificações do sistema e o registro completo fica em `data/abrir-app.log`.

`scripts/fechar-app.sh` encerra o servidor. Ele aparece como um segundo atalho, "Fechar
Controle Financeiro", e também como a ação "Fechar o app" no menu de contexto do primeiro.

Para instalar o atalho, com o caminho do projeto já preenchido:

```bash
sed "s|__PROJETO__|$PWD|" scripts/controle-financeiro.desktop \
  > ~/.local/share/applications/controle-financeiro.desktop
sed "s|__PROJETO__|$PWD|" scripts/controle-financeiro.desktop \
  > ~/Desktop/"Controle Financeiro.desktop"
chmod +x ~/Desktop/"Controle Financeiro.desktop"
```

Pelo menu de aplicativos ele abre direto. Na área de trabalho, o GNOME exige uma
autorização única: botão direito no ícone, "Permitir execução".

## Rodando com Docker

Pré-requisitos: Docker e Docker Compose.

```bash
cp .env.example .env
docker compose up
```

A aplicação sobe em [http://localhost:3000](http://localhost:3000) com hot reload
habilitado — alterações em `src/` são refletidas automaticamente. O banco SQLite fica
persistido em `./data/app.db` no host, montado como volume no container.

Para rodar migrations ou o seed dentro do container:

```bash
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

### Produção

`docker-compose.prod.yml` sobe dois serviços: `migrate`, que aplica as migrations e sai, e
`app`, que só começa depois que o primeiro termina bem.

```bash
cp .env.example .env
npx auth secret            # gera o AUTH_SECRET dentro do .env
docker compose -f docker-compose.prod.yml up -d --build
```

A imagem final usa o `output: "standalone"` do Next e não carrega o CLI do Prisma — ele
tem uma árvore de dependências própria e vive só no estágio `migrate`. O contêiner roda
como usuário sem privilégios, com sistema de arquivos somente leitura, `no-new-privileges`
e um healthcheck em `/api/saude`, que responde 503 se o banco não estiver acessível.

A porta é publicada só em `127.0.0.1`. Para expor à internet, ponha um proxy reverso com
TLS na frente — a sessão vai num cookie, e cookie sem HTTPS é sessão em texto aberto.

## Rodando sem Docker

Pré-requisitos: Node.js 20 ou superior.

```bash
cp .env.example .env
npx auth secret            # gera o AUTH_SECRET dentro do .env
npm install
npm run db:migrate
npm run dev
```

A aplicação sobe em [http://localhost:3000](http://localhost:3000).

## Acesso

O app é de uma pessoa só. Na primeira execução, `/login` vira tela de cadastro e cria a
única conta; depois disso ela volta a ser login e o cadastro fecha. Alternativamente,
`npm run db:seed` cria o acesso junto com os dados de exemplo — sem `SEED_PASSWORD`, ele
sorteia uma senha e a imprime uma única vez no terminal.

Esqueceu a senha? `npm run auth:senha` redefine pelo terminal. Quem tem o arquivo do banco
já pode tudo, então não há segredo perdido aqui — só uma forma de voltar a entrar.

Como funciona por dentro:

- **Auth.js** com provider de credenciais e sessão em JWT, num cookie `httpOnly`,
  `sameSite=lax`, válido por 30 dias.
- **bcrypt com custo 12**, em JavaScript puro — nada de módulo nativo para compilar no
  Docker. O login compara contra um hash descartável quando o e-mail não existe, para o
  tempo de resposta não contar quais e-mails estão cadastrados.
- **Rate limit** de 5 tentativas por minuto por e-mail, com 15 minutos de castigo depois
  disso. Em memória, que é o suficiente para um app que roda numa máquina só.
- **Middleware** protege tudo, menos `/login`, `/api/auth/*` e `/api/saude`. As rotas de
  exportação e de backup entram na proteção: elas despejam o banco inteiro.
- **Toda query filtra por `userId`**, vindo de `requireUserId()` — o ponto único onde a
  identidade entra no domínio.
- **CSP com nonce** e `strict-dynamic`, mais `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS e as políticas de isolamento de origem. O único script inline
  fixo, o que aplica o tema antes da primeira pintura, entra por hash — e um teste garante
  que hash e script não saiam de sincronia.

## Scripts

| Script               | Descrição                                         |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Sobe o servidor de desenvolvimento com hot reload |
| `npm run build`      | Gera o build de produção                          |
| `npm run start`      | Sobe o servidor com o build de produção           |
| `npm run lint`       | Roda o ESLint                                     |
| `npm run format`     | Formata o código com Prettier                     |
| `npm run typecheck`  | Verifica os tipos com o TypeScript                |
| `npm run db:migrate` | Aplica migrations do Prisma em desenvolvimento    |
| `npm run db:seed`    | Popula o banco com dados iniciais                 |
| `npm run db:studio`  | Abre o Prisma Studio para inspecionar o banco     |
| `npm run auth:senha` | Redefine a senha do usuário pelo terminal         |
| `npm run abrir`      | Sobe o app pronto para uso e abre no navegador    |

## Banco de dados

O arquivo SQLite fica em `./data/app.db`, fora do controle de versão (a pasta `data/`
está no `.gitignore`). A conexão é configurada pela variável `DATABASE_URL` em `.env`,
a partir do `.env.example`.

## CI

Todo push roda `typecheck` e `lint` via GitHub Actions (`.github/workflows/ci.yml`).
