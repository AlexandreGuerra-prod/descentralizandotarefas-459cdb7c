## Plano — Melhorias no editor `/processos/$id` + fluxo de exemplo

Aplicar as 5 correções do `prompt-lovable_1.md` e criar um fluxo modelo pronto para uso.

### 1. Etiqueta flutuante (bug fix)
- Adicionar `strokesRef` e `labelsRef` para evitar stale closure em `persistStrokes` / `persistLabels`.
- Reescrever `addFloatLabel` como `useCallback` usando `setLabels` funcional, posicionando a etiqueta no centro visível do canvas via `screenToFlowPosition`.

### 2. Snap vertical em raias (Swimlanes)
- No `onNodeDragStop`, após calcular `lane_id` pela posição Y, reposicionar o nó para dentro da faixa da raia (com padding interno) e persistir `posicao_y` atualizado.

### 3. Nós redimensionáveis
- Migration: `ALTER TABLE process_flow_nodes ADD COLUMN IF NOT EXISTS largura_px integer, altura_px integer`.
- `NodeData` ganha `largura`, `altura`, `onResize`.
- Wrapper do `FlowNode` usa `resize: both; overflow: auto`; `onMouseUp` chama `onResize` que faz `setNodes` + `updateNodeRemote({ largura_px, altura_px })`.
- `decorateNode` lê as colunas e injeta em `data`.

### 4. Setas com arrowhead
- Importar `MarkerType` de `@xyflow/react`.
- Em `onConnect` e no carregamento das edges, aplicar `type: "smoothstep"`, `markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 }`, `style: { strokeWidth: 2 }`.

### 5. Barra Início / Meio / Fim visível no nó
- Adicionar barra inferior com 3 botões (`▶ Início`, `● Meio`, `■ Fim`) em todos os nós exceto comentário, ligada a `onEtapaChange`. Botão ativo colorido (verde/azul/vermelho), inativos com opacidade reduzida. Classe `nodrag` para não interferir no drag.

### 6. Fluxo de exemplo pronto (modelo)
- Adicionar à mesma migration uma função `seed_example_process_flow(uid uuid)` ou inserção via app: ao carregar `/processos` pela primeira vez (lista vazia para o usuário), oferecer botão "Criar fluxo de exemplo" que cria:
  - Fluxo `Exemplo: Solicitação de férias` (`is_template = true`, tipo `profissional`).
  - 2 raias: `Servidor (responsável)` e `RH (responsável)`.
  - 6 nós conforme imagem de referência: `Solicitar férias` (Início, verde), `Preencher form.` (Meio, azul), `Verificar saldo` (Comentário), `Prazo: 30 dias` (Nota), `Analisar pedido` (Meio), `Aprovar` (Fim, vermelho).
  - 1 etiqueta flutuante `⚠ Verificar RH antes` em `canvas_extras`.
  - Edges: Solicitar→Preencher, Preencher→Analisar, Analisar→Aprovar (com arrowhead).
- Implementar como função utilitária `createExampleFlow(userId)` chamada por um botão "Criar fluxo de exemplo" em `processos.index.tsx` (sempre disponível, não apenas quando vazio).

### Arquivos a editar
- `supabase/migrations/<novo>.sql` — colunas `largura_px`, `altura_px`.
- `src/routes/_authenticated/processos.$id.tsx` — itens 1–5.
- `src/routes/_authenticated/processos.index.tsx` — botão "Criar fluxo de exemplo".
- Novo: `src/lib/example-flow.ts` — função que monta o fluxo modelo.

### Critérios de aceite
- Clicar "Etiqueta" cria etiqueta visível no centro do canvas e persiste após reload.
- Arrastar nó entre raias o reposiciona dentro da faixa.
- Cantos do nó permitem redimensionar; tamanho persiste após reload.
- Edges mostram seta direcional.
- Cada nó (não comentário) mostra barra Início/Meio/Fim clicável.
- Botão "Criar fluxo de exemplo" gera o fluxo da imagem de referência, abrível e editável.
