# Funcionalidade: Fluxos de Processos (React Flow) – V3

## 0. Contexto

O Planejador de Tarefas já possui módulos de painel, agenda, histórico e tarefas, além de autenticação via Lovable Cloud (Supabase interno).[page:2]  
Existe um PRD anterior para **Fluxos de Processos**, com uso de `@xyflow/react` (React Flow), porém a implementação atual não cumpre todo o comportamento previsto (cards que não abrem editor, ausência de botão de edição e canvas pouco funcional).[page:2]

Este documento redefine, de forma mais precisa e completa, o escopo da funcionalidade **Fluxos de Processos**, considerando:

- Nova tela `/processos` (lista de fluxos).[page:2]  
- Editor visual `/processos/$id` com React Flow.[page:2]  
- Modelo de dados no Supabase com RLS e novos campos (duração, tipo de etapa, templates, swimlanes).[page:2]

---

## 1. Objetivo

Adicionar ao Planejador de Tarefas uma funcionalidade de **Fluxos de Processos**, onde o usuário:

- Desenha visualmente o passo a passo de uma rotina (de onde vem, o que fazer, para onde vai).[page:2]  
- Pode vincular cada etapa a uma **tarefa real** do sistema (`tasks`) ou deixá-la como **anotação livre**.[page:2]  
- Documenta processos recorrentes (profissionais ou pessoais) de forma visual, para que outras pessoas da equipe compreendam e executem a rotina como um “procedimento padrão”.[page:2]

### Requisitos centrais

- **Canvas visual** com nós conectados por setas, drag-and-drop e exportação nativa.[page:2]  
- **Biblioteca obrigatória**: `@xyflow/react` (React Flow).[page:2]  
- **Persistência** no Supabase com isolamento por usuário (RLS).[page:2]  

---

## 2. Modelo de dados (Supabase)

### 2.1. Tabelas principais

Criar (ou manter) as tabelas abaixo, com RLS seguindo o padrão de `tasks`:

```sql
process_flows (
  id uuid primary key,
  user_id uuid references auth.users (id),
  nome text,
  tipo text check in ('profissional', 'pessoal'),
  descricao text, -- descrição longa opcional do fluxo
  is_template boolean default false, -- indica se é fluxo-modelo
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now()
);

process_flow_nodes (
  id uuid primary key,
  flow_id uuid references process_flows (id) on delete cascade,
  tipo text check in ('tarefa', 'nota'),
  task_id uuid references tasks (id), -- nullable, se tipo='tarefa'
  texto text, -- nullable, se tipo='nota'
  posicao_x double precision,
  posicao_y double precision,
  cor text check in ('blue', 'coral', 'red', 'green', 'amber', 'purple', 'teal', 'pink', 'gray'),
  red_flag boolean default false,
  duracao_estimada_minutes integer, -- nullable
  etapa_tipo text check in ('inicio', 'intermediaria', 'fim'), -- obrigatório
  lane_id uuid -- nullable, referencia process_flow_lanes
);

process_flow_edges (
  id uuid primary key,
  flow_id uuid references process_flows (id) on delete cascade,
  source_node_id uuid references process_flow_nodes (id) on delete cascade,
  target_node_id uuid references process_flow_nodes (id) on delete cascade
);
```

### 2.2. Swimlanes (raias)

Para organização visual por responsável ou por fase, criar a tabela:

```sql
process_flow_lanes (
  id uuid primary key,
  flow_id uuid references process_flows (id) on delete cascade,
  nome text,
  tipo text check in ('responsavel', 'fase'),
  ordem integer,
  orientacao text check in ('horizontal', 'vertical') default 'horizontal'
);
```

Atualizar `process_flow_nodes.lane_id` para referenciar `process_flow_lanes.id` (nullable).[page:2]

### 2.3. Regras de RLS

- Em `process_flows`, todas as operações (select/insert/update/delete) devem ser permitidas apenas quando `user_id = auth.uid()`.  
- Em `process_flow_nodes`, `process_flow_edges` e `process_flow_lanes`, o usuário só pode acessar registros cujo `flow_id` pertença a um `process_flows` com `user_id = auth.uid()`.  
- Reutilizar as mesmas políticas e padrões de RLS já usados em `tasks`.[page:2]

---

## 3. Rota `/processos` – Lista de fluxos

### 3.1. Layout

- Página `/processos` exibe um **grid de cards**, um por registro em `process_flows` do usuário logado.[page:2]  
- Cada card mostra:  
  - Nome do fluxo.  
  - Tipo (badge “Profissional” / “Pessoal”).  
  - Badge opcional “Template” quando `is_template = true`.  
  - Data de atualização (`atualizado_em`) em formato amigável (ex.: “Atualizado em 16/06/2026”).[page:2]  

### 3.2. Ações nos cards

Cada card deve ter **três ações explícitas**:

1. **Editar**  
   - Ícone de lápis ou texto “Editar”.  
   - Ao clicar, navegar para `/processos/$id` carregando o editor visual do fluxo.[page:2]  

2. **Duplicar**  
   - Cria uma cópia completa do fluxo:  
     - Duplica registro em `process_flows` (novo `id`, `nome` “Cópia de {nome original}” ou similar).  
     - Duplica todos os `process_flow_nodes` e `process_flow_edges` relacionados, mantendo posições, cores, red flags e `etapa_tipo`.  
     - Nós de tipo `tarefa` na cópia ficam **sem `task_id`** (vínculo removido).[page:2]  
   - `is_template` do novo fluxo:  
     - Regra recomendada: se o original é template (`is_template = true`), a cópia vem como fluxo real (`is_template = false`).  
     - Documentar claramente a regra no código e na UI.  

3. **Excluir**  
   - Excluir o fluxo e todos os dados relacionados (`nodes`, `edges`, `lanes`).  
   - Exigir confirmação (modal “Tem certeza?”).  

### 3.3. Clique no card (atalho)

- Clicar no corpo do card (fora dos ícones de ação) deve ter o mesmo efeito do botão **Editar**: abrir `/processos/$id`.[page:2]  

### 3.4. Filtros e busca

- Filtros:  
  - Tipo: “Todos / Profissional / Pessoal”.  
  - Templates: “Todos / Apenas templates / Apenas fluxos reais”.  
- Campo de busca por nome do fluxo (case-insensitive).  

### 3.5. Novo fluxo

- Botão **“Novo fluxo”**:  
  - Cria novo registro em `process_flows` com:  
    - `nome`: “Novo fluxo” (ou vazio).  
    - `tipo`: valor padrão (por exemplo, “profissional”) ou escolhido via dropdown.  
    - `is_template`: por padrão `false`.  
  - Redireciona imediatamente para `/processos/$id` do novo fluxo (editor em branco).[page:2]  

---

## 4. Editor do fluxo `/processos/$id` – Canvas React Flow

### 4.1. Estrutura básica

- Rota: `/processos/$id`.  
- Carregar fluxo (`process_flows`) do usuário corrente com seus nós (`nodes`), conexões (`edges`) e lanes (`lanes`).  
- Layout sugerido:  
  - Cabeçalho com:  
    - Nome do fluxo (input editável).  
    - Tipo (Profissional / Pessoal).  
    - Toggle “Template” (`is_template`).  
    - Botões: “Salvar”, “Exportar”, “Voltar”.  
  - Barra/área para configuração de lanes (responsável/fase).  
  - Canvas React Flow ocupando a maior parte da tela.  

### 4.2. Adicionar nós

Botão **“Adicionar nó”** (na toolbar ou barra lateral) com duas opções:

1. **Nó Tarefa**  
   - Ao selecionar:  
     - Abrir seleção de tarefa existente (lista de `tasks`) ou opção para criar nova tarefa, reutilizando `TaskForm`.[page:2]  
   - Após seleção/criação, criar nó `tipo = 'tarefa'` com:  
     - `task_id` preenchido.  
     - Título da tarefa como texto exibido no nó.  

2. **Nó Nota**  
   - Criar nó `tipo = 'nota'` com campo `texto` livre.  
   - Edição inline: clicar no nó permite editar o texto na própria interface.  

Para ambos:

- Definir posição inicial (centro do canvas ou posição padrão).  
- Aplicar cor padrão (por exemplo, `blue`).  
- `etapa_tipo` padrão: `intermediaria`.  
- `duracao_estimada_minutes` inicial: null.  

### 4.3. Propriedades dos nós

Cada nó deve permitir configurar:

- **Cor**  
  - Paleta fixa: `blue`, `coral`, `red`, `green`, `amber`, `purple`, `teal`, `pink`, `gray`.  
  - Aplicada como fundo do nó.  

- **Red flag (prioridade)**  
  - Toggle booleano `red_flag`.  
  - Quando ativo, exibir bandeira vermelha (ícone/badge) no canto do nó.  

- **Duração estimada**  
  - Campo numérico (minutos), por exemplo 15, 30, 60.  
  - Armazenado em `duracao_estimada_minutes`.  

- **Tipo de etapa**  
  - Seleção obrigatória: `inicio`, `intermediaria`, `fim`.  
  - Usar rótulos amigáveis na UI: “Início”, “Intermediária”, “Fim”.  
  - Visual diferenciado por tipo (ex.: borda verde para início, borda dupla para fim).  

- **Comportamento por tipo**:  
  - **Nó Tarefa**:  
    - Clique abre `TaskCard` (modal) da tarefa vinculada (`task_id`), permitindo editar dados da tarefa sem sair do fluxo.[page:2]  
  - **Nó Nota**:  
    - Clique permite edição inline do texto.  

### 4.4. Conexões (edges)

- Usuário deve poder criar conexões arrastando setas entre nós, usando APIs do React Flow.[page:2]  
- Ao criar conexão, inserir registro em `process_flow_edges` com `source_node_id` e `target_node_id`.  
- Ao remover conexão, remover o registro correspondente.  

---

## 5. Swimlanes (raias) – Organização visual

### 5.1. Conceito

Swimlanes são faixas horizontais ou verticais que agrupam nós por **responsável** ou por **fase**.[page:2]  

Exemplos:

- Responsável: “Cliente”, “Backoffice”, “Financeiro”.  
- Fase: “Entrada”, “Processamento”, “Saída”.  

### 5.2. Configuração das lanes

Na tela `/processos/$id`:

- Seção “Swimlanes” com:  
  - Modo de agrupamento (`tipo` da lane):  
    - “Por responsável” (`responsavel`).  
    - “Por fase” (`fase`).  
  - Botões para adicionar, renomear e remover lanes.  
- Cada lane é um registro em `process_flow_lanes` com `nome`, `tipo`, `ordem`, `orientacao`.[page:2]  
- `orientacao` controla se lanes são horizontais ou verticais (inicialmente, usar `horizontal` como padrão).  

### 5.3. Associação de nós a lanes

- Cada nó pode ter `lane_id` (nullable).  
- No canvas:  
  - Lanes aparecem como faixas com o `nome` no título.  
  - Arrastar um nó para dentro de uma lane atualiza seu `lane_id`.  
  - Ao recarregar, o nó aparece na mesma lane.  

Critérios de aceite:

- Usuário consegue criar ao menos duas lanes para um fluxo.  
- É possível ver visualmente quais nós pertencem a cada lane.  
- Mover um nó entre lanes reflete na persistência (`lane_id` atualizado).  

---

## 6. Salvamento e validações

### 6.1. Salvamento

- Dados a serem salvos no Supabase:  
  - `process_flows`: nome, tipo, descrição, `is_template`, timestamps.  
  - `process_flow_nodes`: tipo, `task_id`/`texto`, posição, cor, `red_flag`, `duracao_estimada_minutes`, `etapa_tipo`, `lane_id`.  
  - `process_flow_edges`: `source_node_id`, `target_node_id`.  
  - `process_flow_lanes`: nome, tipo, ordem, orientação.  

- Salvamento pode ser:  
  - Auto-save com debounce (por exemplo, a cada N segundos ou mudanças), e/ou  
  - Botão “Salvar” que dispara persistência explícita.  
- Mostrar indicador de status: “Salvo às HH:MM” / “Salvando…”.  

### 6.2. Validações mínimas

- Antes de marcar o fluxo como “pronto” ou “ativo” (se for introduzido um campo assim no futuro), aplicar validações básicas:  
  - Pelo menos um nó com `etapa_tipo = 'inicio'`.  
  - Pelo menos um nó com `etapa_tipo = 'fim'`.  
  - Alertar nós isolados (sem nenhuma conexão) para revisão (não bloquear, apenas destacar).  

---

## 7. Exportação

- Botão **“Exportar”** no cabeçalho do editor `/processos/$id`.  
- Usar recursos do React Flow para exportar:  
  - **PNG** do diagrama completo.  
  - **SVG** (se viável) mantendo as cores dos nós e lanes.  
- Fundo deve ser **sólido** (não transparente), para boa leitura em WhatsApp/e-mail.[page:2]  

---

## 8. Navegação e menu

- Adicionar item “Processos” no menu lateral (`AppShell.tsx`), junto com Painel, Agenda, Histórico, Configurações.[page:2]  
- Fluxo de navegação:  
  - Menu → “Processos” → `/processos`.  
  - `/processos` → clique em card ou botão Editar → `/processos/$id`.  
  - `/processos` → clique em “Novo fluxo” → cria fluxo → `/processos/$id`.  
  - `/processos/$id` → botão “Voltar” → `/processos`.  

---

## 9. Restrições

- **Não alterar** comportamento de `/principal`, `/agenda`, `/historico` ou componentes `TaskCard`/`TaskForm`, além de reutilizá-los conforme descrito (especialmente no nó Tarefa).[page:2]  
- Manter intactas as integrações de autenticação (Google/Apple/Lovable OAuth), rotas existentes e configurações de deploy (Lovable Cloud, Vercel etc.).[page:2]  

---

## 10. Critérios de aceite (checklist)

Um fluxo será considerado corretamente implementado quando:

1. **Lista `/processos`**  
   - Cards mostram nome, tipo, badge de template (quando aplicável) e data de atualização.  
   - Clicar no card ou no botão Editar abre `/processos/$id`.  
   - Duplicar cria cópia com nós e conexões, sem `task_id` nos nós de tarefa.  
   - Excluir remove fluxo e dados relacionados.  
   - Filtros por tipo e template funcionam corretamente.  

2. **Editor `/processos/$id`**  
   - É possível adicionar nós de Tarefa e Nota.  
   - Configurar cor, red flag, duração estimada e tipo de etapa para cada nó.  
   - Conectar nós com setas e salvar essas conexões.  
   - Clicar em nó Tarefa abre `TaskCard`.  
   - Clicar em nó Nota permite editar texto inline.  

3. **Swimlanes**  
   - Usuário consegue criar lanes (responsável/fase) e vê faixas no canvas.  
   - Nós podem ser atribuídos e reatribuídos a lanes via drag-and-drop.  
   - Reload da página mantém nós nas lanes corretas.  

4. **Persistência e segurança**  
   - Dados de fluxos, nós, edges e lanes são salvos nas tabelas definidas.  
   - RLS impede acesso a fluxos de outros usuários.  

5. **Exportação**  
   - Botão Exportar gera PNG (e opcionalmente SVG) com fundo sólido do diagrama.  

6. **Navegação**  
   - Item “Processos” leva a `/processos`.  
   - Voltar do editor retorna à lista sem erro.  

Se qualquer item não estiver atendido, a funcionalidade deve ser considerada incompleta frente a este PRD.
