
-- process_flows
CREATE TABLE public.process_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('profissional','pessoal')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_flows TO authenticated;
GRANT ALL ON public.process_flows TO service_role;
ALTER TABLE public.process_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own flows" ON public.process_flows
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_process_flows_updated
  BEFORE UPDATE ON public.process_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- process_flow_nodes
CREATE TABLE public.process_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.process_flows(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('tarefa','nota')),
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  texto text,
  posicao_x double precision NOT NULL DEFAULT 0,
  posicao_y double precision NOT NULL DEFAULT 0,
  cor text NOT NULL DEFAULT 'blue' CHECK (cor IN ('blue','coral','red','green','amber','purple','teal','pink','gray')),
  red_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_flow_nodes TO authenticated;
GRANT ALL ON public.process_flow_nodes TO service_role;
ALTER TABLE public.process_flow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own flow nodes" ON public.process_flow_nodes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.process_flows f WHERE f.id = flow_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.process_flows f WHERE f.id = flow_id AND f.user_id = auth.uid()));
CREATE TRIGGER trg_process_flow_nodes_updated
  BEFORE UPDATE ON public.process_flow_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_pfn_flow ON public.process_flow_nodes(flow_id);

-- process_flow_edges
CREATE TABLE public.process_flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.process_flows(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.process_flow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.process_flow_nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_flow_edges TO authenticated;
GRANT ALL ON public.process_flow_edges TO service_role;
ALTER TABLE public.process_flow_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own flow edges" ON public.process_flow_edges
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.process_flows f WHERE f.id = flow_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.process_flows f WHERE f.id = flow_id AND f.user_id = auth.uid()));
CREATE INDEX idx_pfe_flow ON public.process_flow_edges(flow_id);
