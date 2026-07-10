# Corrigir bug ao criar novos processos

## Diagnóstico

A tela `/processos` falha ao criar um fluxo novo com o erro:

> Could not find the 'drawio_xml' column of 'process_flows' in the schema cache

O código já usa `drawio_xml` como fonte de verdade do conteúdo do fluxo (insert em `processos.index.tsx`, autosave, duplicação, migração legacy), mas a coluna não existe no banco. Existe um arquivo de migration no repo (`supabase/migrations/20260709120000_add_drawio_xml.sql`) que nunca foi executado no Supabase — por isso o schema real tem só 9 colunas em `process_flows` e nada de `drawio_xml`.

## Ação

Rodar uma migration equivalente à que está pendente, de forma segura e idempotente:

```sql
ALTER TABLE public.process_flows
  ADD COLUMN IF NOT EXISTS drawio_xml text;

COMMENT ON COLUMN public.process_flows.drawio_xml IS
  'XML mxGraph/draw.io — fonte de verdade do conteúdo do fluxo desde a migração pro editor embutido. Tabelas relacionais antigas e canvas_extras ficam congeladas, usadas só como entrada da migração por fluxo.';
```

- Aditivo, `IF NOT EXISTS`, nullable, sem default — não mexe em dado existente, não quebra fluxos já criados (o loader do editor faz migração lazy do conteúdo antigo pra XML na primeira abertura).
- Não altera RLS, grants, triggers nem outras tabelas.

Depois que a migration for aprovada e executada, o Supabase regenera `src/integrations/supabase/types.ts` automaticamente e a criação de novos fluxos volta a funcionar.

## Fora do escopo

- Não vou tocar em código de tela nesta rodada — o bug é 100% ausência da coluna.
- Não vou dropar `process_flow_nodes/edges/lanes` nem `canvas_extras` (a migration original também não dropava; ficam congelados como entrada da migração lazy por fluxo).
