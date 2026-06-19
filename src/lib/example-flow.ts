import { supabase } from "@/integrations/supabase/client";

/**
 * Creates the example "Solicitação de férias" process flow for a user,
 * matching the legend image (start, middle, end, note, comment + label).
 */
export async function createExampleFlow(userId: string): Promise<string> {
  // 1) Flow
  const { data: flow, error: fErr } = await supabase
    .from("process_flows")
    .insert({
      user_id: userId,
      nome: "Exemplo: Solicitação de férias",
      tipo: "profissional",
      is_template: true,
      descricao:
        "Fluxo modelo demonstrando todos os tipos de nó (Início, Meio, Fim, Nota, Comentário) e etiqueta flutuante.",
      canvas_extras: {
        strokes: [],
        labels: [
          {
            id: crypto.randomUUID(),
            x: 760,
            y: 60,
            text: "⚠ Verificar RH antes",
            color: "#b45309",
          },
        ],
      } as never,
    })
    .select("id")
    .single();
  if (fErr) throw fErr;
  const flowId = flow.id as string;

  // 2) Lanes (swimlanes)
  const { data: lanes, error: lErr } = await supabase
    .from("process_flow_lanes")
    .insert([
      { flow_id: flowId, nome: "Servidor", tipo: "responsavel", ordem: 0 },
      { flow_id: flowId, nome: "RH", tipo: "responsavel", ordem: 1 },
    ])
    .select("id, ordem");
  if (lErr) throw lErr;
  const lane0 = lanes!.find((l) => l.ordem === 0)!.id;
  const lane1 = lanes!.find((l) => l.ordem === 1)!.id;

  // 3) Nodes
  const LANE_H = 240;
  const y0 = 40;
  const y1 = LANE_H + 40;
  const yMid0 = LANE_H / 2 + 20;

  const nodeRows = [
    {
      flow_id: flowId, lane_id: lane0, tipo: "tarefa", texto: "Solicitar férias",
      posicao_x: 60, posicao_y: y0, cor: "green", etapa_tipo: "inicio",
      cor_texto: "black", red_flag: false,
    },
    {
      flow_id: flowId, lane_id: lane0, tipo: "tarefa", texto: "Preencher formulário",
      posicao_x: 320, posicao_y: y0, cor: "blue", etapa_tipo: "intermediaria",
      cor_texto: "black", red_flag: false,
    },
    {
      flow_id: flowId, lane_id: lane0, tipo: "comentario", texto: "Verificar saldo",
      posicao_x: 320, posicao_y: yMid0, cor: "gray", etapa_tipo: "intermediaria",
      cor_texto: "black", red_flag: false,
    },
    {
      flow_id: flowId, lane_id: lane1, tipo: "nota", texto: "Prazo: 30 dias",
      posicao_x: 60, posicao_y: y1, cor: "amber", etapa_tipo: "intermediaria",
      cor_texto: "black", red_flag: false,
    },
    {
      flow_id: flowId, lane_id: lane1, tipo: "tarefa", texto: "Analisar pedido",
      posicao_x: 320, posicao_y: y1, cor: "purple", etapa_tipo: "intermediaria",
      cor_texto: "black", red_flag: false,
    },
    {
      flow_id: flowId, lane_id: lane1, tipo: "tarefa", texto: "Aprovar",
      posicao_x: 580, posicao_y: y1, cor: "red", etapa_tipo: "fim",
      cor_texto: "black", red_flag: false,
    },
  ];

  const { data: insertedNodes, error: nErr } = await supabase
    .from("process_flow_nodes")
    .insert(nodeRows as never)
    .select("id");
  if (nErr) throw nErr;

  const [nSolicitar, nPreencher, , , nAnalisar, nAprovar] = insertedNodes!;

  // 4) Edges
  const { error: eErr } = await supabase.from("process_flow_edges").insert([
    { flow_id: flowId, source_node_id: nSolicitar.id, target_node_id: nPreencher.id },
    { flow_id: flowId, source_node_id: nPreencher.id, target_node_id: nAnalisar.id },
    { flow_id: flowId, source_node_id: nAnalisar.id, target_node_id: nAprovar.id },
  ]);
  if (eErr) throw eErr;

  return flowId;
}