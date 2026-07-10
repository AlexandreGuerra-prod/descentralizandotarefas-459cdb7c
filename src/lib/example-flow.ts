import { supabase } from "@/integrations/supabase/client";
import {
  buildFlowXml,
  type FlowEdgeInput,
  type FlowLaneInput,
  type FlowNodeInput,
} from "@/features/processos/xmlMapping";

/**
 * Creates the example "Solicitação de férias" process flow for a user,
 * matching the legend image (start, middle, end, note, comment).
 *
 * drawio_xml é a fonte de verdade (ver Fase 3 do plano) — o exemplo é
 * montado com os mesmos builders de xmlMapping.ts usados pelo editor,
 * não por inserts relacionais como na versão React Flow anterior.
 */
export async function createExampleFlow(userId: string): Promise<string> {
  const laneServidor = crypto.randomUUID();
  const laneRH = crypto.randomUUID();

  const lanes: FlowLaneInput[] = [
    { id: laneServidor, nome: "Servidor", tipo: "responsavel", ordem: 0, orientacao: "horizontal" },
    { id: laneRH, nome: "RH", tipo: "responsavel", ordem: 1, orientacao: "horizontal" },
  ];

  const LANE_H = 240;
  const y0 = 40;
  const y1 = LANE_H + 40;
  const yMid0 = LANE_H / 2 + 20;

  const nSolicitar = crypto.randomUUID();
  const nPreencher = crypto.randomUUID();
  const nVerificar = crypto.randomUUID();
  const nPrazo = crypto.randomUUID();
  const nAnalisar = crypto.randomUUID();
  const nAprovar = crypto.randomUUID();

  const nodes: FlowNodeInput[] = [
    {
      id: nSolicitar,
      tipo: "tarefa",
      label: "Solicitar férias",
      cor: "green",
      etapaTipo: "inicio",
      x: 60,
      y: y0,
      parentId: laneServidor,
    },
    {
      id: nPreencher,
      tipo: "tarefa",
      label: "Preencher formulário",
      cor: "blue",
      etapaTipo: "intermediaria",
      x: 320,
      y: y0,
      parentId: laneServidor,
    },
    {
      id: nVerificar,
      tipo: "comentario",
      label: "Verificar saldo",
      cor: "gray",
      x: 320,
      y: yMid0,
      parentId: laneServidor,
    },
    {
      id: nPrazo,
      tipo: "nota",
      label: "Prazo: 30 dias",
      cor: "amber",
      x: 60,
      y: y1,
      parentId: laneRH,
    },
    {
      id: nAnalisar,
      tipo: "tarefa",
      label: "Analisar pedido",
      cor: "purple",
      etapaTipo: "intermediaria",
      x: 320,
      y: y1,
      parentId: laneRH,
    },
    {
      id: nAprovar,
      tipo: "tarefa",
      label: "Aprovar",
      cor: "red",
      etapaTipo: "fim",
      x: 580,
      y: y1,
      parentId: laneRH,
    },
  ];

  const edges: FlowEdgeInput[] = [
    { id: crypto.randomUUID(), sourceId: nSolicitar, targetId: nPreencher },
    { id: crypto.randomUUID(), sourceId: nPreencher, targetId: nAnalisar },
    { id: crypto.randomUUID(), sourceId: nAnalisar, targetId: nAprovar },
  ];

  const xml = buildFlowXml({ lanes, nodes, edges });

  const { data: flow, error } = await supabase
    .from("process_flows")
    .insert({
      user_id: userId,
      nome: "Exemplo: Solicitação de férias",
      tipo: "profissional",
      is_template: true,
      descricao:
        "Fluxo modelo demonstrando todos os tipos de nó (Início, Meio, Fim, Nota, Comentário).",
      drawio_xml: xml,
    })
    .select("id")
    .single();
  if (error) throw error;

  return flow.id as string;
}
