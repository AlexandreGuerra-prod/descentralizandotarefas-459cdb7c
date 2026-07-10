import { COLOR_BG, COLOR_BORDER, TEXT_COLOR, type FlowColor, type TextColor } from "./colorPalette";

/**
 * Construção/leitura do XML mxGraph que passa a ser a fonte de verdade de
 * um fluxo (process_flows.drawio_xml), no lugar das tabelas relacionais
 * antigas (process_flow_nodes/edges/lanes). Mapeamento confirmado
 * empiricamente contra o bundle real do draw.io (round-trip de atributos
 * custom, swimlane nativo, rhombus, terminator — ver spikes na Fase 0/1).
 */

export type EtapaTipo = "inicio" | "intermediaria" | "fim" | "decisao";
export type NodeTipo = "tarefa" | "nota" | "comentario";

export type FlowNodeInput = {
  id: string;
  tipo: NodeTipo;
  label: string;
  taskId?: string | null;
  cor: FlowColor;
  corTexto?: TextColor;
  redFlag?: boolean;
  etapaTipo?: EtapaTipo;
  duracaoEstimadaMinutes?: number | null;
  notaSecundaria?: string | null;
  negrito?: boolean;
  /** Sem equivalente nativo exato no mxGraph para text-shadow — aproximado
   * com `shadow=1` (sombra da forma inteira, não só do texto). Mais simples
   * e robusto que embutir um `<span style="text-shadow">` dentro do label
   * HTML (que exigiria escapar HTML aninhado dentro do atributo `label`
   * do UserObject); ver "Questão em aberto" no plano. */
  sombra?: boolean;
  fontSize?: number | null;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string; // id da raia, se houver — senão "1" (root)
};

export type FlowEdgeInput = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string | null;
};

export type FlowLaneInput = {
  id: string;
  nome: string;
  tipo: "responsavel" | "fase";
  ordem: number;
  orientacao: "horizontal" | "vertical";
  width?: number;
  height?: number;
};

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Calcula o style mxGraph (forma + cores) a partir dos campos de domínio
 * — usado tanto pra serializar um nó novo quanto pela mini-toolbar pra
 * recalcular o style depois de mudar cor/tipo de etapa num nó existente
 * (ver ProcessoToolbar.tsx). */
export function shapeStyleFor(
  node: Pick<
    FlowNodeInput,
    "tipo" | "cor" | "corTexto" | "etapaTipo" | "negrito" | "sombra" | "fontSize"
  >,
): string {
  const bg = COLOR_BG[node.cor];
  const border = COLOR_BORDER[node.cor];
  const fontColor = TEXT_COLOR[node.corTexto ?? "black"];
  const bold = node.negrito ? "fontStyle=1;" : "";
  const shadow = node.sombra ? "shadow=1;" : "";
  const fontSize = node.fontSize != null ? `fontSize=${node.fontSize};` : "";
  const common = `fillColor=${bg};strokeColor=${border};fontColor=${fontColor};${bold}${shadow}${fontSize}html=1;whiteSpace=wrap;`;

  if (node.tipo !== "comentario" && node.etapaTipo === "decisao") {
    return `rhombus;${common}`;
  }
  if (node.tipo !== "comentario" && (node.etapaTipo === "inicio" || node.etapaTipo === "fim")) {
    return `shape=mxgraph.flowchart.terminator;${common}`;
  }
  const dashed = node.tipo === "comentario" ? "dashed=1;" : "";
  return `rounded=1;${dashed}${common}`;
}

/** Atributos custom de um nó (nodeType/task_id/cor/red_flag/etc.) — mesmo
 * conjunto usado tanto na serialização XML quanto no payload estruturado
 * de inserção via plugin (ver buildInsertNodePayload). */
function nodeAttrs(node: FlowNodeInput): Record<string, string> {
  const attrs: Record<string, string> = { nodeType: node.tipo, cor: node.cor };
  if (node.taskId) attrs.task_id = node.taskId;
  if (node.corTexto) attrs.cor_texto = node.corTexto;
  if (node.redFlag) attrs.red_flag = "1";
  if (node.etapaTipo) attrs.etapa_tipo = node.etapaTipo;
  if (node.duracaoEstimadaMinutes != null) {
    attrs.duracao_estimada_minutes = String(node.duracaoEstimadaMinutes);
  }
  if (node.notaSecundaria) attrs.nota_secundaria = node.notaSecundaria;
  if (node.negrito) attrs.negrito = "1";
  if (node.sombra) attrs.sombra = "1";
  if (node.fontSize != null) attrs.font_size = String(node.fontSize);
  return attrs;
}

/** Um único nó (tarefa/nota/comentário), serializado como UserObject +
 * mxCell — atributos custom sobrevivem ao round-trip intactos (confirmado
 * na Fase 0). Usado para montar o documento completo do fluxo (load
 * inicial / migração), não para inserir um nó num fluxo já aberto — para
 * isso ver buildInsertNodePayload (o {action:'merge'} nativo do draw.io
 * não faz upsert de célula, confirmado empiricamente). */
export function buildNodeCellXml(node: FlowNodeInput): string {
  const attrs = { label: node.label, ...nodeAttrs(node) };
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXmlAttr(v)}"`)
    .join(" ");
  const style = shapeStyleFor(node);
  const parent = node.parentId ?? "1";
  const w = node.width ?? 180;
  const h = node.height ?? 70;

  return (
    `<UserObject ${attrStr} id="${escapeXmlAttr(node.id)}">` +
    `<mxCell style="${escapeXmlAttr(style)}" vertex="1" parent="${escapeXmlAttr(parent)}">` +
    `<mxGeometry x="${node.x}" y="${node.y}" width="${w}" height="${h}" as="geometry"/>` +
    `</mxCell></UserObject>`
  );
}

export function buildEdgeCellXml(edge: FlowEdgeInput): string {
  const value = edge.label ? ` value="${escapeXmlAttr(edge.label)}"` : "";
  return (
    `<mxCell id="${escapeXmlAttr(edge.id)}"${value} ` +
    `style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" parent="1" ` +
    `source="${escapeXmlAttr(edge.sourceId)}" target="${escapeXmlAttr(edge.targetId)}">` +
    `<mxGeometry relative="1" as="geometry"/></mxCell>`
  );
}

// --- Desenho livre (canvas_extras) -> shapes nativas do mxGraph ---
//
// O traço de lápis nativo do draw.io serializa como um stencil comprimido
// em base64 (shape=stencil(<blob>)) — formato interno não documentado,
// arriscado de reproduzir do zero (confirmado por spike: um traço
// desenhado na UI real gera esse blob, não uma lista de pontos simples).
// Em vez disso, cada traço vira uma ARESTA com múltiplos pontos
// (sourcePoint/targetPoint + Array de waypoints), sem seta — formato XML
// simples e bem entendido, e visualmente fiel: o app antigo também
// desenhava os traços como polilinhas retas entre os pontos do mouse
// (sem suavização), então não é uma aproximação, é o mesmo resultado.
// Confirmado renderizando de verdade (spike com uma aresta assim).

export type CanvasStrokeInput = {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
  opacity: number;
};

export function buildStrokeCellXml(stroke: CanvasStrokeInput): string | null {
  if (stroke.points.length < 2) return null;
  const [first, ...rest] = stroke.points;
  const last = rest[rest.length - 1];
  const mid = rest.slice(0, -1);
  const midXml = mid.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join("");
  const opacity = Math.round(stroke.opacity * 100);
  const style =
    `endArrow=none;startArrow=none;html=1;rounded=0;curved=0;` +
    `strokeColor=${stroke.color};strokeWidth=${stroke.width};opacity=${opacity};fillColor=none;`;

  return (
    `<mxCell id="${escapeXmlAttr(stroke.id)}" style="${escapeXmlAttr(style)}" edge="1" parent="1">` +
    `<mxGeometry relative="1" as="geometry">` +
    `<mxPoint x="${first[0]}" y="${first[1]}" as="sourcePoint"/>` +
    `<mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>` +
    `<Array as="points">${midXml}</Array>` +
    `</mxGeometry></mxCell>`
  );
}

export type CanvasShapeInput = {
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
};

export function buildShapeCellXml(shape: CanvasShapeInput): string {
  const opacity = Math.round(shape.opacity * 100);

  if (shape.kind === "line" || shape.kind === "arrow") {
    const endArrow = shape.kind === "arrow" ? "classic" : "none";
    const style = `endArrow=${endArrow};startArrow=none;html=1;strokeColor=${shape.color};strokeWidth=${shape.width};opacity=${opacity};`;
    return (
      `<mxCell id="${escapeXmlAttr(shape.id)}" style="${escapeXmlAttr(style)}" edge="1" parent="1">` +
      `<mxGeometry relative="1" as="geometry">` +
      `<mxPoint x="${shape.x}" y="${shape.y}" as="sourcePoint"/>` +
      `<mxPoint x="${shape.x + shape.w}" y="${shape.y + shape.h}" as="targetPoint"/>` +
      `</mxGeometry></mxCell>`
    );
  }

  const ellipse = shape.kind === "ellipse" ? "ellipse;" : "rounded=0;";
  const fill = shape.fill ?? "none";
  const style = `${ellipse}whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${shape.color};strokeWidth=${shape.width};opacity=${opacity};`;
  const x = Math.min(shape.x, shape.x + shape.w);
  const y = Math.min(shape.y, shape.y + shape.h);

  return (
    `<mxCell id="${escapeXmlAttr(shape.id)}" style="${escapeXmlAttr(style)}" vertex="1" parent="1">` +
    `<mxGeometry x="${x}" y="${y}" width="${Math.abs(shape.w)}" height="${Math.abs(shape.h)}" as="geometry"/>` +
    `</mxCell>`
  );
}

export type CanvasTextBoxInput = {
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
};

export function buildTextBoxCellXml(tb: CanvasTextBoxInput): string {
  const vertical = tb.orientation === "vertical" ? "horizontal=0;" : "";
  const style =
    `text;html=1;whiteSpace=wrap;fontColor=${tb.color};fontFamily=${tb.fontFamily};` +
    `fontSize=${tb.fontSize};${vertical}`;

  return (
    `<mxCell id="${escapeXmlAttr(tb.id)}" value="${escapeXmlAttr(tb.text)}" ` +
    `style="${escapeXmlAttr(style)}" vertex="1" parent="1">` +
    `<mxGeometry x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" as="geometry"/>` +
    `</mxCell>`
  );
}

export type CanvasImageInput = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Data URI (base64) — imagens coladas vêm de um bucket PRIVADO com URLs
   * assinadas de 1h (task-attachments), então uma URL direta expiraria;
   * a migração baixa o arquivo e embute como data URI (ver
   * migrateLegacyFlow.ts) pra ficar permanente dentro do XML. */
  dataUri: string;
};

/** Um `;` cru dentro do valor de um style do mxGraph corta a string no
 * lugar errado (`;` é o separador entre pares chave=valor) — uma data URI
 * normal (`data:image/png;base64,AAAA`) quebra exatamente por causa do
 * `;base64`. Mesma correção que o próprio draw.io aplica
 * (`EditorUi.prototype.convertDataUri` em EditorUi.js: "Handles special
 * case of data URI which needs to be rewritten to be used in a cell
 * style to remove the semicolon") — remove o marcador `;base64`, mantendo
 * o conteúdo depois da vírgula intacto. Confirmado por spike: sem isso a
 * imagem quebra (ícone de imagem inválida); com isso, renderiza certo. */
function stripSemicolonFromDataUri(uri: string): string {
  if (!uri.startsWith("data:")) return uri;
  const semi = uri.indexOf(";");
  if (semi <= 0) return uri;
  const comma = uri.indexOf(",", semi + 1);
  if (comma < 0) return uri;
  return uri.slice(0, semi) + uri.slice(comma);
}

export function buildImageCellXml(img: CanvasImageInput): string {
  const style = `shape=image;image=${stripSemicolonFromDataUri(img.dataUri)};`;
  return (
    `<mxCell id="${escapeXmlAttr(img.id)}" style="${escapeXmlAttr(style)}" vertex="1" parent="1">` +
    `<mxGeometry x="${img.x}" y="${img.y}" width="${img.w}" height="${img.h}" as="geometry"/>` +
    `</mxCell>`
  );
}

const LANE_WIDTH = 900;
const LANE_HEIGHT = 160;

/** Pool + uma swimlane nativa por raia, empilhadas por `ordem`. Retorna o
 * XML das células e o id do pool (para uso como parentId dos nós). */
export function buildLanesXml(lanes: FlowLaneInput[]): { xml: string; poolId: string | null } {
  if (lanes.length === 0) return { xml: "", poolId: null };

  const poolId = "pool-root";
  const horizontal = lanes[0]?.orientacao !== "vertical" ? 0 : 1;
  const totalHeight = lanes.length * LANE_HEIGHT;
  let xml =
    `<mxCell id="${poolId}" style="swimlane;horizontal=${horizontal};startSize=0;" ` +
    `vertex="1" parent="1"><mxGeometry x="40" y="40" width="${LANE_WIDTH}" height="${totalHeight}" as="geometry"/></mxCell>`;

  const sorted = [...lanes].sort((a, b) => a.ordem - b.ordem);
  sorted.forEach((lane, i) => {
    xml +=
      `<UserObject label="${escapeXmlAttr(lane.nome)}" lane_tipo="${lane.tipo}" ordem="${lane.ordem}" id="${escapeXmlAttr(lane.id)}">` +
      `<mxCell style="swimlane;horizontal=${horizontal};startSize=30;" vertex="1" parent="${poolId}">` +
      `<mxGeometry y="${i * LANE_HEIGHT}" width="${LANE_WIDTH}" height="${LANE_HEIGHT}" as="geometry"/>` +
      `</mxCell></UserObject>`;
  });

  return { xml, poolId };
}

export function wrapGraphModel(cellsXml: string): string {
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cellsXml}</root></mxGraphModel>`;
}

/** XML mínimo pra um fluxo novo — canvas em branco. */
export function emptyFlowXml(): string {
  return wrapGraphModel("");
}

export function buildCanvasExtrasXml(extras: {
  strokes?: CanvasStrokeInput[];
  shapes?: CanvasShapeInput[];
  textboxes?: CanvasTextBoxInput[];
  images?: CanvasImageInput[];
}): string {
  const strokesXml = (extras.strokes ?? [])
    .map(buildStrokeCellXml)
    .filter((s): s is string => s != null)
    .join("");
  const shapesXml = (extras.shapes ?? []).map(buildShapeCellXml).join("");
  const textboxesXml = (extras.textboxes ?? []).map(buildTextBoxCellXml).join("");
  const imagesXml = (extras.images ?? []).map(buildImageCellXml).join("");
  return strokesXml + shapesXml + textboxesXml + imagesXml;
}

export function buildFlowXml(input: {
  lanes?: FlowLaneInput[];
  nodes: FlowNodeInput[];
  edges: FlowEdgeInput[];
  canvasExtras?: {
    strokes?: CanvasStrokeInput[];
    shapes?: CanvasShapeInput[];
    textboxes?: CanvasTextBoxInput[];
    images?: CanvasImageInput[];
  };
}): string {
  const { xml: lanesXml } = buildLanesXml(input.lanes ?? []);
  const nodesXml = input.nodes.map(buildNodeCellXml).join("");
  const edgesXml = input.edges.map(buildEdgeCellXml).join("");
  const extrasXml = input.canvasExtras ? buildCanvasExtrasXml(input.canvasExtras) : "";
  return wrapGraphModel(lanesXml + nodesXml + edgesXml + extrasXml);
}

/** O draw.io exporta envelopado em <mxfile><diagram>...<mxGraphModel>
 * (confirmado na Fase 0) — o `load` aceita o <mxGraphModel> puro. Essa
 * função aceita os dois formatos e sempre devolve o <mxGraphModel> puro. */
export function unwrapMxfile(xml: string): string {
  const match = xml.match(/<mxGraphModel[\s\S]*<\/mxGraphModel>/);
  return match ? match[0] : xml;
}

/** Payload estruturado (não XML) pra inserir um nó num fluxo já aberto —
 * usado pelo fluxo "Adicionar tarefa ao diagrama" (o node precisa de um
 * tasks.id real antes de existir, então é criado fora do canvas e
 * injetado via a ação customizada {action:'tarefasInsertNode'} tratada
 * pelo plugin no repo fluxograma; o {action:'merge'} nativo do draw.io
 * não serve pra isso — importa como página nova em vez de atualizar a
 * atual, confirmado empiricamente). */
export function buildInsertNodePayload(node: FlowNodeInput): {
  id: string;
  label: string;
  attrs: Record<string, string>;
  style: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
} {
  return {
    id: node.id,
    label: node.label,
    attrs: nodeAttrs(node),
    style: shapeStyleFor(node),
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}
