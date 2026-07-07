-- Add "decisao" as a valid etapa_tipo and a label column for edges
ALTER TABLE public.process_flow_nodes DROP CONSTRAINT IF EXISTS process_flow_nodes_etapa_tipo_check;
ALTER TABLE public.process_flow_nodes
  ADD CONSTRAINT process_flow_nodes_etapa_tipo_check
  CHECK (etapa_tipo IN ('inicio','intermediaria','fim','decisao'));

ALTER TABLE public.process_flow_edges ADD COLUMN IF NOT EXISTS label text;
