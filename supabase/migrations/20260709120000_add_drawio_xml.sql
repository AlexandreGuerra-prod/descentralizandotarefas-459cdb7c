-- Editor de processos passa a usar draw.io embutido no lugar do React
-- Flow custom. drawio_xml vira a fonte de verdade do conteúdo do fluxo
-- (nós, raias, arestas, anotações — tudo num único XML mxGraph), no
-- lugar de process_flow_nodes/edges/lanes + canvas_extras.
--
-- As tabelas relacionais antigas e canvas_extras NÃO são alteradas nem
-- removidas nesta migration — ficam congeladas (somente leitura na
-- prática) como entrada da migração única por fluxo (ver
-- src/features/processos/migrateLegacyFlow.ts), até a janela de
-- validação passar e uma migration de limpeza separada poder dropá-las.
alter table public.process_flows
  add column drawio_xml text;

comment on column public.process_flows.drawio_xml is
  'XML mxGraph/draw.io — fonte de verdade do conteúdo do fluxo desde a migração pro editor embutido. process_flow_nodes/edges/lanes e canvas_extras ficam congelados, usados só como entrada da migração por fluxo.';
