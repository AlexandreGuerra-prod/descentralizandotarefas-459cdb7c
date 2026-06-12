# Planejador de Tarefas — PRD (versão atualizada)

> Documento vivo. Última grande revisão: junho/2026.
> Substitui o PRD inicial após as evoluções de UX, agenda embarcada,
> entrada por voz, conclusão com solução e ajustes de responsividade.

---

## 1. Do que se trata

Um **planejador pessoal e profissional** com cara de painel ZimaOS:
escuro, com cards arredondados e foco em **clareza imediata** do que
precisa ser feito hoje. Funciona como um "segundo cérebro" para quem
precisa **descentralizar tarefas da cabeça**, organizar a rotina,
planejar prazos futuros e manter um histórico auditável do que foi
resolvido (e *como* foi resolvido).

Diferenciais em relação a um Todo comum:

- **Prioridades com alerta visual** (Altíssima e Alta piscam como
  sirene até serem tratadas).
- **Conclusão com solução obrigatória** — ao marcar concluída, o
  usuário descreve *o que foi feito*. Vira histórico pesquisável.
- **Tarefas concluídas hoje** ficam visíveis em uma seção recolhida
  no painel; só vão para o histórico no dia seguinte.
- **Entrada por voz** no título e na descrição (Web Speech API,
  pt-BR).
- **Agenda embarcada** (FullCalendar) com **importação e exportação
  `.ics`** — sem depender de Google Calendar.
- **Recorrência**, **anexos**, **atalhos corporativos editáveis**.

## 2. Para quem serve

- Profissionais que misturam demandas administrativas e pessoais.
- Equipes pequenas que querem cada um ter sua própria visão (cada
  usuário só enxerga o que é seu — RLS no banco).
- Quem precisa registrar **NUP / Origem / Responsável** em tarefas
  profissionais e ao mesmo tempo ter um espaço pessoal limpo.
- Usuários da allowlist atual (configurável no banco).

## 3. Para que serve — casos de uso

1. **Tirar da cabeça**: capturar rapidamente uma demanda (botão de voz,
   colar imagem como anexo) sem perder o fluxo de trabalho.
2. **Organizar o dia**: o painel `/principal` mostra somente o que é
   para hoje, mais os próximos 7 dias, mais o que já foi concluído hoje.
3. **Planejar o futuro**: `/agenda` dá visão mensal/semanal/diária/lista
   das tarefas com prazo.
4. **Auditar o passado**: `/historico` filtra por status, tipo e
   período, mantendo a solução dada para cada tarefa.
5. **Trocar de ferramenta sem perder dados**: exporta `.ics` para
   Google/Outlook/Apple Calendar e importa `.ics` de qualquer agenda.

## 4. Telas e funcionalidades

| Rota | Função |
|------|--------|
| `/auth` | Login Google + e-mail/senha, recuperação de senha, allowlist. |
| `/reset-password` | Redefinição via link de e-mail. |
| `/principal` | Painel do dia: tarefas pendentes de hoje, próximos 7 dias, "Concluídas hoje" recolhível, alerta sirene para prioridade alta/altíssima, busca, filtros, ações rápidas (concluir com solução, editar, deletar, AVISAR por e-mail, WhatsApp, copiar). |
| `/cadastro` e `/cadastro/$id` | Criação/edição de tarefa: tipo (Profissional/Pessoal), prioridade, prazo, recorrência, campos condicionais (Origem, NUP, Responsável), anexos (upload + colar imagem), entrada por voz. |
| `/agenda` | Calendário embarcado (mês/semana/dia/lista). Cores por prioridade, opacidade para concluídas. Exporta `.ics`, importa `.ics`. Mobile abre na visão Lista. |
| `/historico` | Tarefas de dias anteriores. Filtros por status/tipo/período, ordenação, paginação. |
| `/configuracoes` | Atalhos corporativos editáveis (SPED, SISBOL, Webmail etc). |

## 5. Arquitetura técnica

- **Frontend**: React 19 + TanStack Start v1 + Vite 7 + Tailwind v4 +
  shadcn/ui + framer-motion. Tema dark com tokens semânticos em
  `src/styles.css`.
- **Backend**: Lovable Cloud (Postgres + Auth + Storage gerenciados),
  acessado via `createServerFn` e cliente Supabase.
- **Segurança**: RLS em todas as tabelas, allowlist via trigger,
  separação de papéis em tabela própria (`user_roles`).
- **Agenda**: FullCalendar (`@fullcalendar/react` + daygrid/timegrid/
  list/interaction). Import/export `.ics` via `ics` e `ical.js` no
  navegador (zero dependência de servidor).
- **Voz**: Web Speech API nativa do navegador, pt-BR, sem custo.

### Modelo de dados (essencial)

- `profiles` — perfil do usuário.
- `tasks` — tarefas (campos: titulo, descricao, data, prazo, tipo,
  origem, nup, responsavel, prioridade, recorrencia, status, solucao,
  concluida_em, criado_em).
- `task_attachments` — anexos (storage + metadados).
- `shortcuts` — botões corporativos editáveis.
- `allowed_emails` — controle de acesso.
- `user_roles` — papéis (admin/user) para futuras permissões.

## 6. Árvore de diretórios (com função de cada arquivo)

```text
.
├── prd.md                              # Este documento.
├── package.json / bun.lock             # Dependências e lockfile (bun).
├── vite.config.ts                      # Config Vite + plugin TanStack.
├── tsconfig.json                       # TypeScript estrito.
├── components.json                     # Config shadcn/ui.
├── eslint.config.js / .prettier*       # Lint e formatação.
├── supabase/
│   ├── config.toml                     # Config do projeto Cloud (auto).
│   └── migrations/                     # SQL versionado (RLS, tabelas).
└── src/
    ├── styles.css                      # Tokens de tema, dark/light, FullCalendar.
    ├── router.tsx                      # Bootstrap do roteador TanStack.
    ├── start.ts                        # Middlewares globais (errors, auth attacher).
    ├── server.ts                       # Entry SSR.
    ├── routeTree.gen.ts                # Gerado — NÃO editar.
    ├── integrations/
    │   ├── supabase/
    │   │   ├── client.ts               # Cliente browser (publishable key).
    │   │   ├── client.server.ts        # Cliente admin (service role) — só servidor.
    │   │   ├── auth-middleware.ts      # requireSupabaseAuth nos serverFns.
    │   │   ├── auth-attacher.ts        # Anexa Bearer token no client.
    │   │   └── types.ts                # Tipos gerados do schema.
    │   └── lovable/index.ts            # Helpers da plataforma.
    ├── lib/
    │   ├── task-utils.ts               # Tipos Task, helpers de data/prioridade.
    │   ├── utils.ts                    # cn() etc.
    │   ├── config.server.ts            # Configs server-only.
    │   ├── error-capture.ts            # Captura de erros.
    │   ├── error-page.ts               # Página de erro.
    │   ├── lovable-error-reporting.ts  # Telemetria.
    │   └── api/example.functions.ts    # Exemplo de createServerFn.
    ├── hooks/use-mobile.tsx            # Detecta breakpoint mobile.
    ├── components/
    │   ├── AppShell.tsx                # Layout autenticado (sidebar + bottom nav).
    │   ├── TaskForm.tsx                # Formulário de cadastro/edição.
    │   ├── TaskCard.tsx                # Card de tarefa + dialog de solução.
    │   ├── MicButton.tsx               # Botão de gravação de voz (Web Speech API).
    │   └── ui/                         # Componentes shadcn (button, dialog, etc).
    └── routes/
        ├── __root.tsx                  # Shell HTML, head, providers.
        ├── index.tsx                   # Redireciona para /auth ou /principal.
        ├── auth.tsx                    # Login + signup.
        ├── reset-password.tsx          # Redefinição de senha.
        ├── _authenticated.tsx          # Guard de autenticação + AppShell.
        └── _authenticated/
            ├── principal.tsx           # Painel do dia.
            ├── cadastro.tsx            # Nova tarefa.
            ├── cadastro.$id.tsx        # Editar tarefa por id.
            ├── agenda.tsx              # Calendário embarcado + ICS.
            ├── historico.tsx           # Tarefas passadas com filtros.
            └── configuracoes.tsx       # Atalhos e preferências.
```

## 7. Como instalar e usar

### 7.1 Forma recomendada — Lovable Cloud

1. Publique pelo botão **Publish** do Lovable.
2. Aponte um subdomínio (ex.: `tarefas.seudominio.com`) via CNAME no
   Cloudflare para o domínio fornecido. Ative SSL "Full".
3. Configure Google OAuth no Google Cloud Console e cole o Client
   ID/Secret nas configurações do provedor. Adicione o domínio às
   "Authorized redirect URIs".
4. Edite a tabela `allowed_emails` no painel do banco para liberar
   quem pode entrar.
5. Pronto. Backup, escalabilidade e Auth ficam por conta do Cloud.

### 7.2 Self-host como container no ZimaOS

> O Lovable não gera nativamente um `docker-compose.yaml`. O passo a
> passo abaixo descreve como **exportar o código** e empacotar como
> container que roda na sua ZimaBoard/ZimaOS. Requer comodidade com
> linha de comando.

#### Pré-requisitos

- ZimaOS com Docker e Portainer (ou App Store ZimaOS).
- Uma instância **Supabase self-hosted** (oficial: `supabase/supabase`
  via docker-compose) **ou** continuar usando o Lovable Cloud como
  backend remoto (mais simples).
- Domínio público + Cloudflare Tunnel se quiser acesso externo.

#### Passo a passo

> **Importante sobre o backend:** existem duas formas de rodar o container.
> **A) Mais simples** — continuar usando o Lovable Cloud como backend remoto.
> Nesse caso você NÃO precisa de `SUPABASE_SERVICE_ROLE_KEY` (ela é gerenciada
> internamente e não é exposta). **B) Apontando para seu próprio Supabase**
> (ex.: projeto `organizador-tarefas` que você criou no Supabase) — aí você
> precisa das credenciais do seu projeto, incluindo a service role se for rodar
> server functions com privilégios administrativos no container.

1. **Exporte o código** do Lovable para o GitHub (botão GitHub no
   topo do editor) e clone no seu PC:
   ```bash
   git clone https://github.com/<seu-usuario>/<seu-repo>.git planejador
   cd planejador
   bun install
   ```

2. **Crie `.env.production`** com as variáveis do backend escolhido:

   **Opção A — Lovable Cloud (recomendado, zero manutenção de banco):**
   ```env
   VITE_SUPABASE_URL=https://<ref-do-seu-projeto-lovable>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key-do-projeto-lovable>
   ```
   > `SUPABASE_SERVICE_ROLE_KEY` NÃO é necessária aqui. O Lovable Cloud
   > injeta automaticamente as credenciais de servidor no runtime das
   > server functions. Você nunca vê essa chave — e isso é proposital,
   > por segurança.

   **Opção B — Seu próprio Supabase (ex.: `organizador-tarefas`):**
   ```env
   VITE_SUPABASE_URL=https://<ref-do-seu-supabase>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key-do-seu-supabase>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key-do-seu-supabase>
   ```
   > `SUPABASE_SERVICE_ROLE_KEY` só é necessária se você for rodar
   > server functions que façam operações administrativas (ex.: backfills,
   > gerenciamento de roles) dentro do container. Para uso normal do app
   > (login, CRUD de tarefas, upload de anexos), a `PUBLISHABLE_KEY` basta.

3. **Build de produção**:
   ```bash
   bun run build
   ```
   Saída em `.output/` (servidor Node) e `dist/` (assets).

4. **Crie um `Dockerfile`** na raiz:
   ```dockerfile
   FROM oven/bun:1 AS build
   WORKDIR /app
   COPY . .
   RUN bun install --frozen-lockfile && bun run build

   FROM node:20-alpine
   WORKDIR /app
   COPY --from=build /app/.output ./.output
   COPY --from=build /app/package.json ./
   ENV NODE_ENV=production PORT=3000
   EXPOSE 3000
   CMD ["node", ".output/server/index.mjs"]
   ```

5. **`docker-compose.yaml`** para o ZimaOS:
   ```yaml
   services:
     planejador:
       build: .
       container_name: planejador
       restart: unless-stopped
       ports:
         - "3000:3000"
       env_file: .env.production
   ```

6. **No ZimaOS**:
   - App Store → **Import** → cole o `docker-compose.yaml`.
   - Ou via Portainer: Stacks → Add Stack → cole o conteúdo.
   - Suba o stack. Acesse `http://<ip-da-zima>:3000`.

7. **Acesso externo (opcional)**: configure Cloudflare Tunnel
   apontando `tarefas.seudominio.com` para `http://planejador:3000`.
   Atualize o redirect URI do Google OAuth para o domínio público.

8. **Banco**: se usar Supabase self-hosted, rode as migrações da
   pasta `supabase/migrations/` em ordem no Postgres alvo
   (`psql -f arquivo.sql`).

## 8. Como usar bem o app

- **Capture sem fricção**: ao receber uma demanda, abra `/cadastro`,
  use o microfone para ditar título e descrição, defina prioridade
  e prazo. Não tente classificar tudo na hora — você refina depois.
- **Marque prioridade com honestidade**: reserve **Altíssima** para o
  que realmente acende a sirene. Se tudo é altíssimo, nada é.
- **Conclua escrevendo a solução**: o campo é obrigatório de
  propósito. Em três meses, você vai agradecer ao "eu do passado".
- **Revise o dia no `/principal`** de manhã e antes de encerrar.
- **Use a `/agenda` semanalmente** para enxergar carga futura e
  redistribuir prazos.
- **Exporte `.ics` periodicamente** como backup paralelo, mesmo que
  você não use Google Calendar.

## 9. Sugestões de melhorias futuras

Ideias listadas em ordem de impacto vs esforço (estimativa).

1. **PWA instalável + offline read** — alto impacto, médio esforço.
2. **Notificações nativas do navegador** para prazos próximos —
   alto impacto, baixo esforço.
3. **Modo Foco** (tela cheia só com Altíssima/Alta) — médio, baixo.
4. **Tags livres** além de Profissional/Pessoal — médio, baixo.
5. **Compartilhamento de tarefa** entre usuários da allowlist
   (delegação com aceite) — alto, alto.
6. **Drag-and-drop** na agenda para reagendar — médio, médio.
7. **Resumo diário por IA** ("O que sobrou de ontem? Quais
   prioridades hoje?") via Lovable AI Gateway — alto, médio.
8. **Atalhos de teclado** (`N` nova, `/` busca, `Enter` concluir) —
   médio, baixo.
9. **Backup automático semanal** em JSON para Storage — médio, baixo.
10. **Auditoria** (quem alterou o quê, quando) — útil quando o app
    ganhar uso compartilhado.
11. **Importação de planilha Excel/CSV** para migração inicial.
12. **Integração com Telegram/Signal** para criar tarefa por mensagem.

## 10. O que mudou em relação ao PRD original

- **Saiu**: integração direta com Google Calendar (OAuth, tokens em
  banco, sincronização automática).
- **Entrou**: agenda embarcada (FullCalendar) com export/import `.ics`
  — funciona com qualquer calendário, sem credenciais externas.
- **Entrou**: entrada por voz em título e descrição.
- **Entrou**: alerta visual tipo sirene para prioridade Alta/Altíssima.
- **Entrou**: conclusão exige escrever a **solução dada**.
- **Entrou**: seção "Concluídas hoje" recolhível no painel; tarefas
  só migram para `/historico` no dia seguinte.
- **Entrou**: responsividade revista para smartphone, tablet, notebook
  e desktop (toolbar e calendário se adaptam ao viewport).

---

*Dúvidas, ideias ou reclamações? Abra uma tarefa no próprio app com
tipo "Pessoal", prioridade "Média" e descrição começando com `[app]`.
Assim a gente come a própria comida.*
