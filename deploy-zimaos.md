# Anexo ao PRD — Deploy Self-Host no ZimaOS (TanStack Start + SSR)

> Documento complementar ao `prd.md` do Planejador de Tarefas.
> Registra o caminho real percorrido para colocar uma aplicação
> **TanStack Start (SSR)** no ar dentro de um container Docker no
> ZimaOS, incluindo todos os obstáculos encontrados e como cada um
> foi resolvido. Serve como manual de procedimento para os próximos
> projetos com a mesma stack.

---

## 1. Contexto e diagnóstico inicial

Antes de qualquer comando, é preciso responder uma pergunta:

> **O projeto gera build estático (SPA) ou servidor SSR?**

Verifique o `vite.config.ts`. Se aparecer `@lovable.dev/vite-tanstack-config`
com `tanstackStart`, **é SSR** — o build gera um servidor Node, não
arquivos estáticos prontos para Nginx puro.

```
SPA (Vite puro)        → dist/ com index.html → serve com Nginx
SSR (TanStack Start)   → dist/client + dist/server → precisa de Node rodando
```

Essa diferença muda **tudo** no Dockerfile. Identificá-la no início
evita 80% do retrabalho que tivemos aqui.

---

## 2. Pré-requisitos organizacionais (feitos uma única vez)

Estes passos não se repetem por projeto — uma vez feitos, valem para
todos os projetos futuros na mesma identidade.

### 2.1 Identidade única para o ecossistema

Centralizar Lovable + GitHub + Supabase numa única conta evita
projetos espalhados em contas pessoais diferentes.

```
cond.montcarloresidence@gmail.com
├── Lovable    (workspace "Monte Carlo")
├── GitHub     (org/usuário próprio)
└── Supabase   (organização própria, ex: MonteCarlo_JPPB)
```

**Como migrar um projeto já existente:**
1. Criar conta GitHub nova vinculada ao Gmail do projeto.
2. Criar conta Supabase via "Continue with GitHub" usando o GitHub novo.
3. Na Lovable → Settings → Conectores → Supabase → vincular a nova
   organização ao workspace.
4. Dentro do projeto → reconectar ao GitHub novo → criar repositório.

### 2.2 Onde ficam as chaves do Supabase (armadilha comum)

A Lovable cria, por padrão, um **Supabase interno gerenciado por ela**
— invisível nas configurações normais do projeto. Se você quer um
Supabase **próprio** (para self-host), é preciso:

1. Criar o projeto manualmente em supabase.com, dentro da sua
   organização.
2. Pedir para a Lovable migrar o projeto para esse Supabase (ela
   roda as migrations automaticamente).
3. As chaves do **seu** Supabase ficam em:
   ```
   supabase.com → [organização] → [projeto] → Settings → API
   ```

**Nomenclatura de chaves (mudança recente do Supabase):**

| Nome antigo | Nome novo | Uso |
|---|---|---|
| `anon key` (JWT longo) | `publishable key` (`sb_publishable_...`) | Cliente/frontend |
| `service_role key` | (sem mudança) | Servidor, nunca no frontend |

Use a **publishable key** nova (`sb_publishable_...`) em todas as
variáveis `*_PUBLISHABLE_KEY`. É a mesma coisa que o PRD chama de
"anon key", só com nome atualizado.

> ⚠️ **Nunca cole chaves reais em chats, e-mails ou prints.** Se isso
> acontecer, gire (rotate) as chaves imediatamente em Settings → API.

---

## 3. Mapeamento de portas — fazer ANTES de criar o compose

Servidores ZimaOS com muitos apps acumulam portas ocupadas. Verificar
**antes** evita o container subir e conflitar silenciosamente.

```bash
sudo ss -tlnp | grep LISTEN
```

Reserve uma porta livre na faixa 30xx ou 80xx (sequência fácil de
lembrar). Anote num documento de controle — por exemplo:

| Porta | Serviço |
|---|---|
| 3000 | AdGuard |
| 3003 | convo-cash-pal |
| 3009 | (outro projeto) |
| 3010 | planejador ✅ |
| 3011+ | livres para próximos projetos |

---

## 4. Passo a passo de deploy (caminho feliz)

### 4.1 Clonar o repositório no ZimaOS

Trabalhar dentro do `/DATA/AppData/<projeto>/app` — é o disco onde o
Docker tem permissão total de leitura/escrita. Mídias externas
(`/media/...`) frequentemente dão `read-only file system` para o
Docker.

```bash
sudo mkdir -p /DATA/AppData/<projeto>/app
cd /DATA/AppData/<projeto>
git clone https://github.com/<org>/<repo>.git app
cd app
```

Se o repositório for privado e o `git clone` der `Repository not found`,
autentique:

```bash
sudo apt-get install gh   # ou: winget install GitHub.cli no Windows
gh auth login
```

### 4.2 Criar `.env.production`

```bash
sudo tee .env.production << 'EOF'
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
VITE_SUPABASE_PROJECT_ID=<ref>

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_PROJECT_ID=<ref>
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
EOF
```

> Use **sempre** `sudo tee << 'EOF'` para criar arquivos no ZimaOS.
> `nano` com sudo costuma deixar o arquivo com dono `root`, e heredocs
> simples (`cat > arquivo << EOF`, sem aspas no EOF) sofrem expansão
> de variáveis e quebram. Detalhe na seção 6.

### 4.3 Dockerfile — versão que funciona para TanStack Start SSR

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY server-wrapper.js ./
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server-wrapper.js"]
```

Pontos críticos (explicados na seção 5):
- **`node_modules` precisa ser copiado** — o bundle SSR depende de
  pacotes externos (`h3-v2` e outros) que não são inlinados.
- **Não usar `nginx:alpine` como runtime final** — o build do
  TanStack Start não gera `index.html` estático em `dist/client`.
  Servir só os assets resulta em 404/403.

### 4.4 `server-wrapper.js` — ponte entre Node e o handler SSR

O `dist/server/server.js` gerado pelo Nitro exporta um handler no
formato `{ fetch(request) }` (padrão Cloudflare Workers/Fetch API),
**não** um servidor HTTP Node tradicional. É preciso um wrapper:

```javascript
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const STATIC_DIR = join(__dirname, 'dist/client');

const MIME_TYPES = {
  '.js': 'application/javascript', '.css': 'text/css',
  '.html': 'text/html', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const { default: handler } = await import('./dist/server/server.js');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filePath = join(STATIC_DIR, url.pathname);

  // 1. Serve assets estáticos diretamente (JS, CSS, imagens)
  if (existsSync(filePath) && !filePath.endsWith('/')) {
    const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(readFileSync(filePath));
    return;
  }

  // 2. Tudo o mais vai para o handler SSR (rotas, API, etc)
  const request = new Request(url.toString(), {
    method: req.method,
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(([_, v]) => v !== undefined)
    ),
  });

  try {
    const response = await handler.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

### 4.5 `docker-compose.yaml`

```yaml
services:
  planejador:
    build: .
    container_name: planejador
    restart: unless-stopped
    ports:
      - "3010:3000"   # esquerda = porta livre no ZimaOS, direita = porta interna do server-wrapper
    env_file: .env.production
```

### 4.6 Build e subida

O Docker no ZimaOS frequentemente não tem permissão de escrever em
`/root/.docker`. Use um config próprio dentro do AppData:

```bash
sudo mkdir -p /DATA/AppData/<projeto>/.docker

cd /DATA/AppData/<projeto>/app
sudo docker --config /DATA/AppData/<projeto>/.docker compose down
sudo docker rmi app-<projeto> 2>/dev/null
sudo docker --config /DATA/AppData/<projeto>/.docker build --no-cache -t app-<projeto> .
sudo docker --config /DATA/AppData/<projeto>/.docker compose up -d
```

### 4.7 Validação

```bash
# 1. Container está de pé (não em "Restarting")?
sudo docker ps | grep <projeto>

# 2. Logs sem erro?
sudo docker logs <projeto>

# 3. Servidor responde?
curl -v --max-time 10 http://localhost:<porta>
# Esperado: HTTP 200 ou 307 redirect para a rota inicial do app
```

Se tudo OK, acesse `http://<ip-do-zimaos>:<porta>` no navegador.

---

## 5. Catálogo de erros encontrados e suas causas

Esta seção é o "atlas de armadilhas" — cada erro real encontrado no
processo, sua causa raiz e a correção. Útil para diagnóstico rápido
em projetos futuros com a mesma stack.

### 5.1 `mkdir /root/.docker: read-only file system`

**Causa:** Docker no ZimaOS não tem permissão de escrita na home do
root.
**Correção:** sempre usar `sudo docker --config /DATA/AppData/<projeto>/.docker ...`
em todos os comandos docker/compose.

### 5.2 `failed to calculate checksum of ref ...: "/app/.output": not found`

**Causa:** o Dockerfile foi escrito assumindo que o build gera
`.output/` (padrão de outras configs Nitro/Vinxi), mas esta versão
do TanStack Start + Vite 7 gera em `dist/client/` e `dist/server/`.
**Correção:** `COPY --from=build /app/dist ./dist` (não `.output`).
Sempre rodar o build com `--progress=plain` e ler os caminhos reais
que aparecem no log antes de escrever o `COPY`.

### 5.3 Container builda mas fica em `Restarting (0)`

**Causa:** o `CMD` aponta para um arquivo que não é um servidor HTTP
de verdade (no nosso caso, `dist/server/server.js` é um wrapper de
captura de erro que faz `export default { fetch }`, formato Workers).
Ele executa, não dá erro (exit 0), mas não abre porta nenhuma —
então o Docker marca como saudável e reinicia em loop.
**Diagnóstico:**
```bash
sudo docker run --rm --env-file .env.production <imagem> node <entrypoint> 2>&1; echo "EXIT: $?"
```
Se `EXIT: 0` e nada ficou escutando, o entrypoint está errado.
**Correção:** usar um `server-wrapper.js` (seção 4.4) que importe o
handler e o exponha via `http.createServer`.

### 5.4 `Cannot find package 'h3-v2' imported from .../server-XXXX.js`

**Causa:** o bundle SSR faz `import` dinâmico de pacotes que não
foram inlinados pelo bundler — eles precisam existir em
`node_modules` em runtime.
**Correção:** copiar `node_modules` inteiro no estágio final do
Dockerfile:
```dockerfile
COPY --from=build /app/node_modules ./node_modules
```
Aumenta o tamanho da imagem, mas é a forma confiável de garantir que
todas as dependências server-side estejam disponíveis.

### 5.5 Página mostra "Welcome to nginx!" mesmo com `nginx.conf` customizado

**Causa:** o `default.conf` padrão do Nginx (`nginx:alpine`) coexiste
com o customizado em `/etc/nginx/conf.d/` e pode prevalecer dependendo
da ordem de `COPY` e de cache de build.
**Correção (quando aplicável a SPA puro):**
```dockerfile
RUN rm /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/client .
COPY nginx.conf /etc/nginx/conf.d/default.conf
```
No nosso caso específico (SSR), o caminho final não usou Nginx —
mas esse passo é o correto para projetos **SPA estáticos**.

### 5.6 `403 Forbidden` do Nginx

**Causa:** a pasta servida não contém `index.html` — comum quando o
build SSR não gera HTML estático em `dist/client/`.
**Diagnóstico:**
```bash
sudo docker exec <container> ls /usr/share/nginx/html
# Se aparecer só "assets" e "favicon.ico", não há index.html
```
**Correção:** confirma que o projeto é SSR (seção 1) → abandonar
Nginx puro → usar `server-wrapper.js` (seção 4.4).

### 5.7 Todos os assets retornam 404 no Console do navegador

**Causa:** o `server-wrapper.js` só encaminha para o handler SSR,
sem servir arquivos estáticos de `dist/client/assets/`.
**Correção:** adicionar a checagem de arquivo estático **antes** de
chamar o handler (bloco 1 do código na seção 4.4).

### 5.8 Porta escolhida já está em uso por outro serviço

**Causa:** ZimaOS com muitos apps acumula portas. Ex.: porta `3000`
ocupada pelo AdGuard, porta `80`/`81` pelo Nginx Proxy Manager.
**Correção:** sempre rodar `sudo ss -tlnp | grep LISTEN` (seção 3)
antes de escolher porta. Trocar tanto no `docker-compose.yaml`
quanto, se aplicável, no `EXPOSE` do Dockerfile.

### 5.9 Heredoc (`cat > arquivo << EOF`) grava o próprio comando dentro do arquivo

**Causa:** usar `sudo` **depois** do `cat >` faz o redirecionamento
ser interpretado pelo shell do usuário normal (sem permissão), e
combinações com aspas erradas fazem o heredoc não ser reconhecido —
o texto literal do comando acaba dentro do arquivo.
**Correção:** usar `sudo tee arquivo << 'EOF' ... EOF` (aspas simples
em `'EOF'` evitam expansão de variáveis, e `tee` já roda com sudo
corretamente):
```bash
sudo tee Dockerfile << 'EOF'
conteúdo aqui
EOF
```
Sempre `cat arquivo` depois para confirmar o conteúdo real.

---

## 6. Checklist rápido para o próximo projeto

```
[ ] Verificar vite.config.ts → SPA ou SSR (TanStack Start)?
[ ] Mapear portas livres (sudo ss -tlnp | grep LISTEN)
[ ] Clonar em /DATA/AppData/<projeto>/app (nunca em /media/...)
[ ] Criar .env.production com sudo tee << 'EOF'
[ ] Pegar chaves em supabase.com → projeto próprio → Settings → API
    (usar sb_publishable_..., nunca colar service_role em chat)

Se SPA:
[ ] Dockerfile com estágio final nginx:alpine
[ ] rm default.conf + rm -rf html/* antes do COPY
[ ] nginx.conf customizado com try_files $uri /index.html

Se SSR (TanStack Start):
[ ] Dockerfile com estágio final node:20-alpine
[ ] COPY dist/ + node_modules/ + package.json
[ ] server-wrapper.js servindo estáticos de dist/client + handler SSR
[ ] CMD ["node", "server-wrapper.js"]

[ ] sudo mkdir -p /DATA/AppData/<projeto>/.docker
[ ] sudo docker --config .../.docker build --no-cache -t app-<projeto> .
[ ] sudo docker --config .../.docker compose up -d
[ ] sudo docker logs <projeto>  (sem erros)
[ ] curl -v http://localhost:<porta>  (200 ou redirect esperado)
[ ] Testar no navegador
[ ] (Opcional) Cloudflare Tunnel → subdomínio próprio
```

---

## 7. Fluxo de sincronização contínua (pós-deploy)

```
Lovable (edita código)
    ↓ push automático
GitHub (fonte da verdade)
    ↓ git pull manual
ZimaOS (/DATA/AppData/<projeto>/app)
    ↓ rebuild
Container atualizado
```

Comando de atualização (após `git pull`):
```bash
cd /DATA/AppData/<projeto>/app
git pull
sudo docker --config /DATA/AppData/<projeto>/.docker compose down
sudo docker rmi app-<projeto>
sudo docker --config /DATA/AppData/<projeto>/.docker build --no-cache -t app-<projeto> .
sudo docker --config /DATA/AppData/<projeto>/.docker compose up -d
```

O banco de dados (Supabase) é compartilhado entre o preview da
Lovable e o container no ZimaOS — não há cópia de dados, é a mesma
fonte. Apenas o **código/interface** precisa ser sincronizado
manualmente via Git.

---

## 8. Lições para o prompt inicial de projetos futuros

Ao pedir um novo projeto à Lovable que será self-hosted, declare
explicitamente no prompt:

```
Stack: React + TypeScript + Vite + TanStack Router + Tailwind +
shadcn/ui + Supabase.
Build deve ser SPA estático (sem SSR, sem TanStack Start, sem Nitro).
```

Isso evita todo o capítulo 5 deste documento. Se o projeto **precisar**
de SSR (rotas autenticadas via `createServerFn`, por exemplo), aceite
a complexidade adicional e siga o caminho SSR documentado aqui desde
o início — não tente converter um SSR existente para SPA depois, é
mais trabalhoso que recomeçar.
