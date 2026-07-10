import { supabase } from "@/integrations/supabase/client";
import {
  buildFlowXml,
  emptyFlowXml,
  type CanvasImageInput,
  type CanvasShapeInput,
  type CanvasStrokeInput,
  type CanvasTextBoxInput,
  type FlowEdgeInput,
  type FlowLaneInput,
  type FlowNodeInput,
} from "./xmlMapping";
import type { FlowColor, TextColor } from "./colorPalette";

// Formato do blob canvas_extras salvo pelo editor React Flow antigo —
// replicado aqui só pra ler os dados na migração (não é mais escrito por
// nenhum código novo).
type LegacyCanvasExtras = {
  strokes?: {
    id: string;
    color: string;
    width: number;
    opacity: number;
    points: [number, number][];
  }[];
  labels?: { id: string; x: number; y: number; text: string; color?: string }[];
  shapes?: {
    id: string;
    kind: "rect" | "ellipse" | "line" | "arrow";
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    fill: string | null;
    width: number;
    opacity: number;
  }[];
  textboxes?: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    color: string;
    fontFamily: string;
    fontSize: number;
    orientation: "horizontal" | "vertical";
  }[];
  images?: { id: string; x: number; y: number; w: number; h: number; storagePath: string }[];
};

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Baixa cada imagem colada do bucket privado (task-attachments — URLs
 * assinadas expiram em 1h, não dá pra referenciar por URL direta num XML
 * que devia ser permanente) e embute como data URI. Roda em paralelo;
 * imagens que falharem ao baixar são simplesmente omitidas (log no
 * console) em vez de derrubar a migração inteira do fluxo. */
async function resolveImages(images: LegacyCanvasExtras["images"]): Promise<CanvasImageInput[]> {
  if (!images || images.length === 0) return [];

  const resolved = await Promise.all(
    images.map(async (img): Promise<CanvasImageInput | null> => {
      const { data, error } = await supabase.storage
        .from("task-attachments")
        .download(img.storagePath);
      if (error || !data) {
        console.warn(`[migrateLegacyFlow] falha ao baixar imagem ${img.storagePath}:`, error);
        return null;
      }
      const dataUri = await blobToDataUri(data);
      return { id: img.id, x: img.x, y: img.y, w: img.w, h: img.h, dataUri };
    }),
  );

  return resolved.filter((img): img is CanvasImageInput => img != null);
}

/**
 * Migração única (lazy, por fluxo) das tabelas relacionais antigas
 * (process_flow_nodes/edges/lanes) + canvas_extras pra drawio_xml — ver
 * Fase 3 do plano. Chamada pelo loader de /processos/$id quando
 * drawio_xml ainda é null.
 *
 * Nós, raias, arestas e todo o desenho livre (traços, formas, caixas de
 * texto, imagens coladas) migram. Traços de lápis viram arestas com
 * múltiplos pontos em vez do formato nativo de stencil comprimido do
 * draw.io (não reproduzível de forma confiável sem reimplementar o
 * algoritmo de compressão deles) — visualmente idêntico, já que o editor
 * antigo também desenhava os traços como polilinhas retas, sem
 * suavização (confirmado renderizando de verdade, ver commit).
 */
export async function migrateLegacyFlowToXml(flowId: string): Promise<string> {
  const [{ data: flow }, { data: lanes }, { data: nodes }, { data: edges }] = await Promise.all([
    supabase.from("process_flows").select("canvas_extras").eq("id", flowId).single(),
    supabase.from("process_flow_lanes").select("*").eq("flow_id", flowId),
    supabase.from("process_flow_nodes").select("*").eq("flow_id", flowId),
    supabase.from("process_flow_edges").select("*").eq("flow_id", flowId),
  ]);

  if (!nodes || nodes.length === 0) {
    return emptyFlowXml();
  }

  const laneInputs: FlowLaneInput[] = (lanes ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    tipo: l.tipo as "responsavel" | "fase",
    ordem: l.ordem,
    orientacao: l.orientacao as "horizontal" | "vertical",
  }));

  // Título de exibição: tarefas usam o texto salvo em `texto` como
  // fallback (a versão React Flow resolvia o título ao vivo via join com
  // `tasks`, não guardava cópia — migração usa o que tiver disponível
  // localmente pra não depender de uma segunda consulta por nó aqui).
  const nodeInputs: FlowNodeInput[] = nodes.map((n) => ({
    id: n.id,
    tipo: n.tipo as FlowNodeInput["tipo"],
    label: n.texto ?? "",
    taskId: n.task_id,
    cor: (n.cor as FlowColor) ?? "blue",
    corTexto: (n.cor_texto as TextColor) ?? undefined,
    redFlag: n.red_flag ?? false,
    etapaTipo: (n.etapa_tipo as FlowNodeInput["etapaTipo"]) ?? "intermediaria",
    duracaoEstimadaMinutes: n.duracao_estimada_minutes,
    notaSecundaria: n.comentario,
    negrito: n.negrito ?? false,
    sombra: n.sombra ?? false,
    fontSize: n.font_size,
    x: n.posicao_x,
    y: n.posicao_y,
    width: n.largura_px ?? undefined,
    height: n.altura_px ?? undefined,
    parentId: n.lane_id ?? undefined,
  }));

  const edgeInputs: FlowEdgeInput[] = (edges ?? []).map((e) => ({
    id: e.id,
    sourceId: e.source_node_id,
    targetId: e.target_node_id,
    label: e.label,
  }));

  // Rótulos flutuantes do canvas_extras viram nós de nota simples,
  // posicionados como estavam.
  const canvasExtras = (flow?.canvas_extras as LegacyCanvasExtras | null) ?? null;
  const labelNodes: FlowNodeInput[] = (canvasExtras?.labels ?? []).map((label) => ({
    id: `label-${label.id}`,
    tipo: "nota",
    label: label.text,
    cor: "amber",
    x: label.x,
    y: label.y,
  }));

  const strokes: CanvasStrokeInput[] = canvasExtras?.strokes ?? [];
  const shapes: CanvasShapeInput[] = canvasExtras?.shapes ?? [];
  const textboxes: CanvasTextBoxInput[] = canvasExtras?.textboxes ?? [];
  const images = await resolveImages(canvasExtras?.images);

  return buildFlowXml({
    lanes: laneInputs,
    nodes: [...nodeInputs, ...labelNodes],
    edges: edgeInputs,
    canvasExtras: { strokes, shapes, textboxes, images },
  });
}

/** Garante que o fluxo tem drawio_xml — roda a migração e persiste se
 * ainda não tiver sido feita. Idempotente (não re-roda se já existir). */
export async function ensureDrawioXml(flowId: string): Promise<string> {
  const { data, error } = await supabase
    .from("process_flows")
    .select("drawio_xml")
    .eq("id", flowId)
    .single();
  if (error) throw error;

  if (data.drawio_xml) return data.drawio_xml;

  const xml = await migrateLegacyFlowToXml(flowId);
  const { error: updateError } = await supabase
    .from("process_flows")
    .update({ drawio_xml: xml })
    .eq("id", flowId);
  if (updateError) throw updateError;

  return xml;
}
