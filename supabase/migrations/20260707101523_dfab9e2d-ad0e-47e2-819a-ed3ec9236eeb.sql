ALTER TABLE public.process_flow_nodes
  ADD COLUMN IF NOT EXISTS font_size integer,
  ADD COLUMN IF NOT EXISTS negrito boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sombra boolean NOT NULL DEFAULT false;