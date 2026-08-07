# Instruções para agentes

Planejador de tarefas diárias. Vite + TanStack Start/Router + React +
shadcn/ui + Supabase. Responda e comente o código **em português do Brasil**.

Este arquivo trata **do código**. Ele é público — não coloque aqui endereço de
rede interna, nome de servidor, caminho de máquina ou credencial.

---

## Antes de dizer que terminou

Nenhuma alteração está pronta sem estes três comandos passando. O build sozinho
não basta: ele já passou verde por meses enquanto gerava uma saída que o
contêiner de produção não sabia executar.

```bash
npx tsc --noEmit                              # precisa sair limpo
NITRO_PRESET=node-server npm run build        # precisa gerar .output/server/index.mjs
node .output/server/index.mjs                 # precisa subir e responder nas rotas
```

Se mexeu em rota, confira que ela responde 200 de verdade — inclusive
`/auth`, `/principal`, `/cadastro`, `/agenda`, `/historico`, `/anotacoes` e
`/processos`.

Use `npm install`, **não `npm ci`**: existem dois lockfiles neste repositório
(`bun.lock`, usado pelo Dockerfile, e `package-lock.json`, para uso local) e
eles saem de sincronia com facilidade.

---

## Invariantes — não reverta sem ler o motivo

Cada item abaixo já foi um bug em produção. O código "mais limpo" ou "mais
óbvio" é justamente a versão quebrada.

### Autenticação: nunca `getUser()` em caminho quente

O guard de `src/routes/_authenticated.tsx` usa `supabase.auth.getSession()`.
Não troque por `getUser()`.

`getUser()` faz uma **chamada de rede** a `/auth/v1/user`, e o `beforeLoad`
roda a cada navegação — inclusive no redirect que acontece logo depois de
salvar uma tarefa. Como o guard tratava `error` como "não autenticado", uma
oscilação de rede derrubava o usuário na tela de login no meio do trabalho.
`getSession()` lê do `localStorage` e só vai à rede quando o token expirou.

Não validar o JWT no cliente **não afrouxa segurança**: quem barra acesso
indevido é o RLS no Postgres. Um token forjado no navegador renderiza uma
casca vazia, porque toda query volta sem linhas.

Pela mesma razão, dentro de rotas sob `_authenticated`, pegue o usuário do
contexto — `useRouteContext({ from: "/_authenticated" })` — em vez de chamar
`getUser()` de novo. Cada chamada é uma ida à rede que pode falhar.

### Datas: `data` é local, `prazo` é UTC

- `tasks.data` é uma coluna `DATE`, sem fuso. Para comparar com "hoje", use
  `todayISO()` / `offsetTodayISO()` de `src/lib/task-utils.ts`. **Nunca**
  `new Date().toISOString().slice(0, 10)` — isso é UTC e desloca o corte em um
  dia inteiro depois das 21h no horário de Brasília.
- `tasks.prazo` é `TIMESTAMPTZ` e chega em UTC. **Nunca** fatie a string crua
  (`prazo.slice(11, 16)`): isso entrega a hora UTC, que ao ser re-salva é
  reinterpretada como local e empurra o prazo em 3h **a cada edição**. Use
  `splitPrazoLocal()`.

### Salvar tarefa: o INSERT não pode acontecer duas vezes

`TaskForm` guarda o id da tarefa recém-criada em `createdIdRef`. Sem isso,
qualquer falha posterior ao INSERT (tipicamente o upload de um anexo) deixava
`taskId` indefinido, e o segundo clique em Salvar criava uma **tarefa
duplicada**.

Falha de anexo é aviso, não erro fatal: a tarefa já está gravada. Os anexos que
falharam voltam para a fila para nova tentativa. E se o upload sobe mas o
metadado em `task_attachments` falha, o arquivo é removido do storage — sem o
metadado ele não aparece em lugar nenhum e vira lixo órfão.

### Deploy: o alvo é um contêiner Node, não um worker

O Nitro gera `.output/` no preset `cloudflare-module` por padrão. O contêiner
self-hosted precisa de `NITRO_PRESET=node-server`, que produz um servidor HTTP
autocontido em `.output/server/index.mjs` — sem necessidade de `node_modules`.

Não presuma `dist/`. Não reintroduza um wrapper de servidor: o preset
`node-server` já escuta em `PORT`.

O build do próprio Lovable força Cloudflare e ignora esse preset. Os dois
caminhos convivem; não "unifique" removendo um deles.

### Banco: toda estrutura precisa de migration

O bucket de storage `task-attachments` existiu por meses sem migration, porque
foi criado pela interface. Qualquer ambiente novo quebrava no primeiro anexo.
Bucket, policy, coluna, trigger — se não está em `supabase/migrations/`, não
existe.

RLS é a fronteira de segurança da aplicação. Toda tabela nova nasce com
`ENABLE ROW LEVEL SECURITY` e policy por `auth.uid()`.

---

## Arquivos gerados — não edite

Alterações aqui são sobrescritas na próxima geração:

- `src/routeTree.gen.ts`
- `src/integrations/supabase/client.ts`, `client.server.ts`,
  `auth-attacher.ts`, `auth-middleware.ts`
- `src/integrations/lovable/index.ts`
- `.github/copilot-toolbox-*.md`

`vite.config.ts` tem um aviso no topo: o preset do Lovable já inclui
tanstackStart, viteReact, tailwind, nitro e outros. Adicioná-los à mão duplica
plugins e quebra a aplicação.

---

## Contexto de execução

A aplicação é acessada por **túnel externo**, não por rede local. Trate a rede
como instável:

- Falha de rede e falha de autenticação são **coisas diferentes**. Nunca
  colapse as duas no mesmo tratamento — foi exatamente esse atalho que causou
  as quedas intermitentes ao salvar.
- Mensagem de erro para o usuário precisa dizer se o trabalho dele se perdeu ou
  não. "Failed to fetch" não informa nada a quem está usando.
- Não faça `return` mudo quando algo falha. Silêncio é pior que erro: o usuário
  acha que funcionou.

---

## Segurança

- O `.env` está versionado neste repositório **público**. As chaves ali são
  publicáveis (`SUPABASE_URL`, `PROJECT_ID`, `PUBLISHABLE_KEY` — a anon, feita
  para ir no bundle). **Nunca acrescente um segredo a esse arquivo** — em
  especial `SERVICE_ROLE_KEY`, que ignora RLS. Segredo vai em variável de
  ambiente do servidor, nunca em arquivo versionado.
- Acesso ao app é restrito por allowlist de e-mails (`public.allowed_emails`),
  aplicada por trigger em `auth.users`.
