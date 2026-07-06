## Refinamentos finais — tarefas, anexos e notas vinculadas

### 1. Ordenação por número (lista de tarefas) — `src/routes/_authenticated/principal.tsx` + `src/lib/task-utils.ts`

- Adicionar em `task-utils.ts` um helper `sortTasksByNumero(tasks, dir: "asc" | "desc")` que ordena por `numero` (tratando `null` no fim).
- Em `principal.tsx`, adicionar estado `sortMode: "prioridade" | "numero-asc" | "numero-desc"` (default: `"prioridade"` — mantém comportamento atual).
- Renderizar um `<Select>` compacto ao lado do campo de busca ("Ordenar por: Prioridade / Número ↑ / Número ↓").
- Aplicar `sortMode` a `todayTasks`, `upcoming` e `doneToday` (as três listas da tela). Historico/agenda ficam de fora — o pedido é sobre "lista de tarefas" (principal).

### 2. Validação hard de 10 MB — `src/components/TaskForm.tsx`

Atualmente `onFiles` já bloqueia via `input type=file`, mas **não trata paste de imagens** nem exibe o nome do arquivo bloqueado de forma consistente:

- Extrair `validateSize(file)` helper local que emite o toast `"O arquivo <nome> é maior que 10MB e foi bloqueado"` e retorna boolean.
- `onFiles`: em vez de `return` no primeiro arquivo grande, filtrar apenas os que passam e adicionar o resto (não descartar todos por causa de um).
- `handlePaste`: aplicar a mesma validação antes de anexar imagem colada.

### 3. Visualizador de anexos in-app (Modal) — `src/components/TaskForm.tsx`

- Novo estado `preview: { url: string; name: string; mime: string } | null`.
- `viewAttachment(att)` passa a receber o registro completo: gera signed URL (validade ~5 min) e abre o `Dialog` em vez de `window.open`.
- Dentro do `Dialog` (largura `max-w-4xl`, altura viewport):
  - `image/*` → `<img src={url} class="max-h-[80vh] w-auto mx-auto" />`
  - `application/pdf` → `<iframe src={url} class="w-full h-[80vh]" />`
  - `text/*` → `<iframe>` também funciona
  - Outros mimes → mensagem "Pré-visualização não disponível" + botões **Abrir em nova aba** e **Baixar** (via link com `download`).
- Rodapé do Dialog sempre com botão **Abrir em nova aba** (fallback universal) e **Fechar**.

### 4. Notas vinculadas listadas no TaskForm — `src/components/TaskForm.tsx`

Só faz sentido em modo edição (`taskId` existe). Reaproveita a coluna `notes.task_id` já criada.

- Nova `useQuery(["task-notes", taskId])` que faz `select("id, titulo, updated_at").eq("task_id", taskId).order("updated_at", { ascending: false })`. `enabled: !!taskId`.
- Nova seção "Notas vinculadas" (abaixo de "Anexos"), visível só quando `taskId`:
  - Lista com título + data (`toLocaleDateString("pt-BR")`).
  - Título clicável → `<Link to="/anotacoes" search={{ taskId, titulo, numero }}>` (mesmo padrão que já abre a nota linkada existente na tela de anotações).
  - Botão ícone `Trash2` por linha → abre um `AlertDialog` de confirmação (padrão do projeto, sem `confirm()` nativo) → `supabase.from("notes").delete().eq("id", noteId)` → invalida `["task-notes", taskId]` + toast.
- Se `notes.length === 0`, mostrar linha discreta "Nenhuma nota vinculada" com um link "Criar nota" para `/anotacoes` (mesma rota do botão do TaskCard).

### Detalhes técnicos

- Nenhuma migração de banco. Todas as colunas necessárias (`tasks.numero`, `notes.task_id`) já existem.
- Sem novos pacotes; `Dialog` e `AlertDialog` do shadcn já estão no projeto.
- Preview de anexos via `createSignedUrl(path, 300)` (5 min, suficiente enquanto o modal fica aberto).
- Textos em pt-BR. Confirmação de exclusão via `AlertDialog` (regra do workspace: nada de `confirm()`).

### Arquivos alterados

- `src/lib/task-utils.ts` (+ helper de ordenação por número)
- `src/routes/_authenticated/principal.tsx` (controle de ordenação)
- `src/components/TaskForm.tsx` (validação hard, modal de preview, seção de notas vinculadas)

### Validação

- Selecionar "Número ↓" → cards renderizam com `#N` decrescente em todas as 3 seções.
- Selecionar arquivo >10 MB → toast de bloqueio, arquivo não entra na lista; arquivos <10 MB no mesmo select continuam sendo adicionados.
- Colar imagem grande com Ctrl+V → mesmo toast, nada é anexado.
- Clicar no olho de uma imagem → modal abre com `<img>`; PDF abre em `<iframe>`; `.docx` mostra fallback com botão de abrir/baixar.
- Editar tarefa com nota vinculada → seção "Notas vinculadas" lista o título e permite excluir com confirmação; após excluir, some da lista.
