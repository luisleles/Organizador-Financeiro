# Acesso pelo celular

O app roda no seu computador. O celular precisa de duas coisas para conversar com ele: um
caminho de rede até a máquina e um endereço estável para chamá-la.

A recomendação é **Tailscale**. Ele resolve os dois de uma vez, dá HTTPS de verdade — o que
o PWA exige para instalar — e o mesmo endereço continua funcionando quando você sai de casa,
sem trocar nada de configuração. Quem não quiser instalar nada além do que já tem encontra o
plano B com Caddy e mkcert no fim.

---

## Tailscale (recomendado)

### 1. No computador que roda o app

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

O comando abre um endereço para você autenticar no navegador. Depois disso, veja o nome que
a máquina recebeu:

```bash
tailscale status --json | grep -i '"DNSName"' | head -1
```

Algo como `notebook.seu-tailnet.ts.net`. **Esse é o endereço do app daqui em diante.**

### 2. Publicar o app na sua tailnet

Com o app rodando na porta 3000:

```bash
sudo tailscale serve --bg 3000
```

`serve` põe um HTTPS na frente do app, com certificado emitido pela própria Tailscale, e o
expõe **somente para os seus dispositivos** — nada disso vai para a internet aberta. Confira:

```bash
tailscale serve status
```

Deve aparecer `https://notebook.seu-tailnet.ts.net/ → http://127.0.0.1:3000`.

> **`serve` e não `funnel`.** `tailscale funnel` publicaria o app para a internet inteira.
> Aqui não há motivo: o celular é seu e vai estar na tailnet.

### 3. Contar ao app qual é o endereço dele

Este passo é o que a maioria dos tutoriais esquece, e ele é o **único** que falha em
silêncio. No `.env`:

```bash
AUTH_URL="https://notebook.seu-tailnet.ts.net"
```

Depois reconstrua e suba de novo (`npm run build && bash scripts/abrir-app.sh`, ou
`docker compose -f docker-compose.prod.yml up -d --build`).

Sem isso, o Auth.js monta o callback do login apontando para `localhost` — que, no celular, é
o próprio celular. O sintoma é cruel: a senha é aceita, a tela recarrega e volta para o
login, **sem mensagem de erro nenhuma**, para sempre. Se acontecer, é aqui que se olha
primeiro.

Ligar `AUTH_URL` em HTTPS também faz o cookie de sessão virar `Secure` e ganhar o prefixo
`__Secure-`, que é o comportamento correto — e por isso trocar de `http://localhost` para o
endereço da tailnet desconecta a sessão que estava aberta. É esperado: entre de novo.

### 4. No celular

1. Instale o Tailscale (App Store ou Play Store) e entre com a mesma conta.
2. Abra `https://notebook.seu-tailnet.ts.net` no navegador.
3. Faça login no app.
4. **Instale como aplicativo**: no iPhone, Compartilhar → "Adicionar à Tela de Início"; no
   Android, o menu do Chrome → "Instalar aplicativo". O app passa a abrir sem barra de
   navegador, com ícone próprio.

### 5. Fora de casa

Nada muda. O mesmo endereço `https://notebook.seu-tailnet.ts.net` funciona no 4G, no Wi-Fi
do trabalho ou em outro país, desde que o Tailscale esteja ligado nos dois lados e o
computador esteja acordado. É essa a diferença para uma solução de LAN: **não existe uma
segunda configuração para "acesso remoto"** — o acesso remoto é o mesmo acesso.

Vale ajustar o computador para não suspender, ou o app fica fora do ar quando a tela apaga:

```bash
sudo systemctl mask sleep.target suspend.target hybrid-sleep.target
```

---

## Plano B: Caddy + mkcert na LAN

Para quem não quer Tailscale. Funciona **só dentro de casa** — fora dela, não há acesso.

O problema a resolver é o HTTPS: sem ele o PWA não instala e o cookie `Secure` não pode ser
usado. `mkcert` cria uma autoridade certificadora local e emite um certificado para o IP da
máquina; o Caddy serve o app por trás dele.

### 1. Descubra o IP fixo da máquina na rede

```bash
hostname -I | awk '{print $1}'    # ex.: 192.168.18.8
```

Reserve esse IP no seu roteador (DHCP estático), senão ele muda e o certificado deixa de
valer.

### 2. Gere o certificado

```bash
sudo apt install libnss3-tools
curl -L https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64 -o mkcert
chmod +x mkcert && sudo mv mkcert /usr/local/bin/

mkcert -install
mkcert 192.168.18.8
```

Saem dois arquivos: `192.168.18.8.pem` e `192.168.18.8-key.pem`.

### 3. Caddy na frente do app

`Caddyfile`:

```caddyfile
https://192.168.18.8 {
    tls ./192.168.18.8.pem ./192.168.18.8-key.pem
    reverse_proxy 127.0.0.1:3000
}
```

```bash
caddy run --config Caddyfile
```

### 4. Contar ao app, de novo

```bash
AUTH_URL="https://192.168.18.8"
```

Mesma pegadinha da seção anterior, mesma consequência se esquecer.

### 5. Confiar na autoridade no celular

Esta é a parte chata, e é o motivo de o Tailscale ser a recomendação:

- **Android**: copie o arquivo `rootCA.pem` (o caminho sai de `mkcert -CAROOT`) para o
  celular e instale em Configurações → Segurança → Credenciais → Instalar certificado →
  Certificado CA. O Android exibe um aviso permanente de que a rede pode ser monitorada.
- **iOS**: envie o `rootCA.pem` para o aparelho, instale o perfil em Ajustes → Geral →
  VPN e Gerenciamento de Dispositivo e **depois** habilite em Ajustes → Geral → Sobre →
  Configurações de Confiança de Certificado. Sem esse segundo passo o certificado é
  instalado e ignorado.

### Por que não HTTP puro na LAN

Funciona para ler, e é por isso que a tentação existe. Mas sem HTTPS o navegador não instala
o PWA, o cookie de sessão não pode ser `Secure`, e a senha trafega em texto aberto pelo
Wi-Fi. Para um app que mostra seu patrimônio inteiro, é caro demais pelo que se economiza.

---

## Conferindo que deu certo

```bash
# do próprio computador, pelo endereço público
curl -sI https://notebook.seu-tailnet.ts.net/login | head -1

# o healthcheck responde sem sessão
curl -s https://notebook.seu-tailnet.ts.net/api/saude
```

No celular, os três sinais de que está tudo no lugar:

1. O cadeado aparece na barra de endereço.
2. O navegador oferece instalar o app.
3. O login entra e **continua entrado** no dia seguinte — a sessão dura 30 dias e se renova
   sozinha a cada uso.
