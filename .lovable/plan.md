# Planejador de Tarefas Diárias — Plano

## Viabilidade e decisão de hospedagem

O Lovable constrói apps web full-stack (React + TanStack Start) com backend gerenciado no **Lovable Cloud** (Postgres + Auth + Storage). Ele **não gera um container Docker** com `docker-compose.yaml` para rodar dentro do ZimaOS como o Nextcloud.

Recomendação: publicar no **Lovable Cloud** e expor o app através de um subdomínio no seu Cloudflare (ex.: `tarefas.seudominio.com`). Vantagens:
- Login Google funciona nativamente (precisa de HTTPS + domínio público).
- Backup, anexos e sincronização entre dispositivos sem manutenção.
- Pronto para uso multiusuário em minutos.

Se mais tarde você quiser realmente rodar no ZimaOS, dá para exportar o código e adaptar para Postgres + storage S3-like locais — mas isso é trabalho manual, fora do Lovable.

## Usuários autorizados (allowlist)

Apenas estes e-mails poderão entrar (Google ou e-mail/senha):
- guerra7@gmail.com
- cond.montcarloresidence@gmail.com
- servidoresdo1gpte@gmail.com
- joandiapsicologa@gmail.com
- alexandre.guerratem51@gmail.com

Qualquer outro e-mail é bloqueado no login com mensagem clara.

## Telas (mapeadas do PRD)

- `/auth` — Login (Google + e-mail/senha) e cadastro com recuperação de senha.
- `/principal` — Lista do dia, busca, filtros, próximos 7 dias, recorrência, prioridade com destaque visual, AVISAR (e-mail), WhatsApp, copiar, editar, deletar, backup/importar, conectar Google Calendar.
- `/cadastro` — Cadastro de tarefa (Profissional/Pessoal), anexos por upload e colar, campos condicionais (Origem, NUP, Responsável), atalhos SPED/SISBOL/Webmail.
- `/historico` — Concluídas e não concluídas de dias anteriores, filtros por status/tipo/período, ordenação, detalhar, editar, deletar, "carregar mais".
- `/configuracoes` — Atalhos corporativos editáveis (nome/URL/ícone), preferências.
- `/reset-password` — Página de redefinição de senha.

## Arquitetura técnica (resumo)

- **Frontend:** React 19 + TanStack Start + Tailwind v4 + shadcn/ui. Tema dark inspirado no ZimaOS (cards arredondados, glow sutil).
- **Auth:** Lovable Cloud Auth com Google OAuth + e-mail/senha. Allowlist via tabela `allowed_emails` + trigger que bloqueia signup fora da lista.
- **Banco (Postgres com RLS):**
  - `profiles` (id → auth.users, nome, avatar)
  - `tasks` (id, user_id, titulo, descricao, data, prazo, tipo, origem, nup, responsavel, prioridade, recorrencia, status, solucao, publicacao_numero, publicacao_data, criado_em, concluido_em)
  - `task_attachments` (id, task_id, storage_path, mime, tamanho)
  - `shortcuts` (id, user_id, nome, url, icone) — para os botões corporativos editáveis
  - `google_calendar_tokens` (user_id, access/refresh, scopes)
  - `allowed_emails` (email)
- **Storage:** bucket privado para anexos, com RLS por `user_id`.
- **Server functions** (`createServerFn`): CRUD de tarefas, criação automática da próxima ocorrência ao concluir recorrente, importação/exportação de backup JSON, OAuth do Google Calendar (per-user via App User Connector).
- **Job diário** (pg_cron + rota `/api/public/*` assinada): ao virar o dia, para tarefas pendentes — sem prazo repete no dia seguinte; com prazo, marca para o usuário decidir manter/excluir no próximo acesso.
- **Notificações no app:** badge piscante em vermelho para Altíssima/Alta e prazos próximos. Notificações nativas do navegador (opt-in).

## Integrações

- **Google Calendar**: OAuth per-user (cada usuário conecta o próprio Calendar). Sincroniza tarefas com prazo como eventos.
- **AVISAR**: abre `mailto:` com corpo pré-preenchido.
- **WhatsApp**: abre `https://wa.me/?text=...` com o conteúdo da tarefa.
- **Atalhos SPED/SISBOL/Webmail**: criados como defaults editáveis em `/configuracoes`. Aviso de que os links com IP interno (`10.45.17.242`) só funcionam dentro da rede do quartel.

## Sugestões de melhoria ao PRD

1. **Atalhos editáveis** em vez de hardcoded — facilita ajustes sem novo deploy.
2. **Backup automático** semanal além do manual (JSON exportável).
3. **PWA** (instalável no celular/desktop, ícone na tela inicial, funciona offline para leitura).
4. **Tags livres** além de Profissional/Pessoal (ex.: "DIEX", "Reunião", "Urgente").
5. **Auditoria mínima**: created_at, updated_at e quem alterou (útil quando equipe compartilhar).
6. **Anexos**: limite de 10 MB/arquivo e 50 MB/tarefa, com preview para imagem/PDF.
7. **Modo "foco do dia"**: tela cheia só com as tarefas Altíssima/Alta.
8. **Atalhos de teclado** (N = nova tarefa, / = busca, Enter = concluir selecionada).

## Plano de entrega (fases)

1. **Fase 1 — Fundação:** ativar Lovable Cloud, schema + RLS, allowlist, login Google + e-mail/senha, layout base dark estilo ZimaOS.
2. **Fase 2 — Tarefas:** /cadastro completo (incluindo colar imagem, anexos, campos condicionais), /principal com busca, filtros, prioridade, checklist, recorrência, solução dada.
3. **Fase 3 — Histórico e backup:** /historico com filtros e paginação, export/import JSON, /configuracoes com atalhos editáveis.
4. **Fase 4 — Integrações e automação:** Google Calendar OAuth, job diário de virada de dia, notificações no navegador, PWA.
5. **Fase 5 — Polimento:** AVISAR/WhatsApp, atalhos de teclado, ajustes finos visuais, instruções de DNS no Cloudflare para o subdomínio.

## Pontos de atenção

- **Google OAuth** exige configurar credenciais no Google Cloud Console (consent screen + Client ID) — você fará isso uma vez quando chegarmos no login social; eu te guio passo a passo.
- **Allowlist**: para adicionar/remover usuários no futuro, você editará a tabela `allowed_emails` pelo painel.
- **Subdomínio Cloudflare**: depois de publicar, você cria um CNAME apontando para o domínio do Lovable e ativa SSL — também te guio quando chegar lá.
- **Self-host ZimaOS**: não está no escopo deste plano. Se quiser depois, faço uma fase extra de portabilidade.
