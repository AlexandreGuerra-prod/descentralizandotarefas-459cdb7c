import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  useViewport,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Download, FileImage, Flag, Plus, StickyNote, ListTodo, Trash2, Palette,
  Settings, ChevronUp, ChevronDown, CheckCircle2, Play, Square, Pencil, Tag, Eraser, MessageSquare, Type,
  MousePointer2, Circle, Minus, MoveUpRight, Undo2, Redo2, Image as ImageIcon, Bold,
} from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/TaskCard";
import type { Task } from "@/lib/task-utils";
import { toPng, toSvg } from "html-to-image";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessFlowEditor,
});

type FlowColor = "blue" | "coral" | "red" | "green" | "amber" | "purple" | "teal" | "pink" | "gray";
type EtapaTipo = "inicio" | "intermediaria" | "fim" | "decisao";
type TextColor = "black" | "slate" | "blue" | "red" | "green";
const ETAPA_LABEL: Record<EtapaTipo, string> = { inicio: "Início", intermediaria: "Intermediária", fim: "Fim", decisao: "Decisão" };

const LANE_HEIGHT = 240;
/** Fallback usado só antes do 1º layout (sem nós ainda) — depois disso a largura real vem de laneWidth. */
const LANE_WIDTH_FALLBACK = 1200;
/** Paleta forte o bastante pra não se perder no fundo do canvas (#fafafa), cicla por índice da raia. */
const LANE_BG = ["#dbeafe", "#fef3c7", "#ede9fe", "#dcfce7", "#fee2e2", "#e0f2fe"];
/** Tom mais saturado da mesma família de cor de LANE_BG (mesmo índice), pra
 * célula de cabeçalho — evita ter que calcular a cor em runtime. */
const LANE_HEADER_BG = ["#93c5fd", "#fcd34d", "#c4b5fd", "#86efac", "#fca5a5", "#7dd3fc"];
const LANE_HEADER_WIDTH = 160;
const MAX_PASTE_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB, mesmo teto do TaskForm

const COLOR_BG: Record<FlowColor, string> = {
  blue: "#dbeafe", coral: "#ffd6cc", red: "#fecaca", green: "#d1fae5",
  amber: "#fde68a", purple: "#e9d5ff", teal: "#ccfbf1", pink: "#fbcfe8", gray: "#e5e7eb",
};
const COLOR_BORDER: Record<FlowColor, string> = {
  blue: "#3b82f6", coral: "#fb7185", red: "#ef4444", green: "#10b981",
  amber: "#f59e0b", purple: "#8b5cf6", teal: "#14b8a6", pink: "#ec4899", gray: "#6b7280",
};
const COLORS = Object.keys(COLOR_BG) as FlowColor[];

const TEXT_COLOR: Record<TextColor, string> = {
  black: "#111827", slate: "#475569", blue: "#1d4ed8", red: "#b91c1c", green: "#15803d",
};
const TEXT_COLORS = Object.keys(TEXT_COLOR) as TextColor[];

const DRAW_COLORS = [
  "#111827", "#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#ffffff",
] as const;
const DRAW_WIDTHS = { extrafina: 1, fina: 2, media: 4, grossa: 8, extragrossa: 16 } as const;
type DrawWidthKey = keyof typeof DRAW_WIDTHS;

/** Ferramenta ativa no canvas — "select" é o padrão (equivalente ao antigo !drawMode). */
type ToolMode = "select" | "pencil" | "erase" | "rect" | "ellipse" | "line" | "arrow" | "text";
const SHAPE_TOOLS = ["rect", "ellipse", "line", "arrow"] as const;
type ShapeKind = (typeof SHAPE_TOOLS)[number];

type Stroke = { id: string; color: string; width: number; opacity: number; points: [number, number][] };
/** Forma reta (retângulo/elipse/linha/seta) — x,y = ponto inicial; w,h = deslocamento até o ponto final. */
type Shape = {
  id: string; kind: ShapeKind; x: number; y: number; w: number; h: number;
  color: string; fill: string | null; width: number; opacity: number;
};
type FloatLabel = { id: string; x: number; y: number; text: string; color: string };
const FONT_FAMILIES = ["Inter, sans-serif", "Georgia, serif", "'Courier New', monospace", "'Comic Sans MS', cursive"] as const;
const FONT_SIZES = [12, 14, 16, 20, 24, 32, 48] as const;
type TextBox = {
  id: string; x: number; y: number; w: number; h: number; text: string;
  color: string; fontFamily: string; fontSize: number; orientation: "horizontal" | "vertical";
};
type PastedImage = { id: string; x: number; y: number; w: number; h: number; storagePath: string };
type CanvasExtras = {
  strokes?: Stroke[]; labels?: FloatLabel[]; shapes?: Shape[]; textboxes?: TextBox[]; images?: PastedImage[];
};

type NodeData = {
  tipo: "tarefa" | "nota" | "comentario";
  texto: string | null;
  task_id: string | null;
  taskTitulo?: string | null;
  cor: FlowColor;
  cor_texto: TextColor;
  comentario: string | null;
  red_flag: boolean;
  duracao_estimada_minutes: number | null;
  etapa_tipo: EtapaTipo;
  largura?: number;
  altura?: number;
  font_size: number | null;
  negrito: boolean;
  sombra: boolean;
  onColorChange: (id: string, cor: FlowColor) => void;
  onTextColorChange: (id: string, c: TextColor) => void;
  onRedFlagToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onDurationChange: (id: string, minutes: number | null) => void;
  onEtapaChange: (id: string, etapa: EtapaTipo) => void;
  onCommentChange: (id: string, c: string) => void;
  onResize: (id: string, w: number, h: number) => void;
  onFontSizeChange: (id: string, size: number | null) => void;
  onBoldToggle: (id: string) => void;
  onShadowToggle: (id: string) => void;
};

function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as NodeData;
  const isComment = d.tipo === "comentario";
  const isDecision = !isComment && d.etapa_tipo === "decisao";
  const isStadium = !isComment && (d.etapa_tipo === "inicio" || d.etapa_tipo === "fim");
  const etapaClass = isComment ? "border-dashed" : "";
  const textColor = TEXT_COLOR[d.cor_texto ?? "black"];
  const bg = isComment ? "#ffffff" : COLOR_BG[d.cor];
  const border = isComment ? "#94a3b8" : COLOR_BORDER[d.cor];
  const contentTextStyle = {
    fontSize: d.font_size ?? undefined,
    fontWeight: d.negrito ? 700 : undefined,
    textShadow: d.sombra ? "1px 1px 2px rgba(0,0,0,0.35)" : undefined,
  };
  const actionsClass = isDecision
    ? `absolute bottom-1 inset-x-0 z-20 justify-center gap-1 nodrag ${selected ? "flex" : "hidden group-hover:flex"}`
    : "flex justify-end gap-1 px-1 pb-1 nodrag";

  // Nota: os Handles do React Flow ficam posicionados PELA METADE fora da
  // borda (translate 50%) — se o overflow/resize morar no MESMO elemento
  // que os Handles, essa metade externa é cortada pelo overflow:auto/hidden
  // (e ainda sobra scrollbar visível por cima do que restou). Por isso o
  // resize/overflow do conteúdo mora num DIV FILHO; o wrapper externo (onde
  // os Handles vivem) nunca corta nada — ele só acompanha o tamanho do
  // filho (bloco sem posicionamento próprio "abraça" o filho).
  return (
    <div className="relative" title={`${d.tipo === "tarefa" ? (d.taskTitulo ?? "Tarefa") : d.texto ?? ""}\nTipo: ${ETAPA_LABEL[d.etapa_tipo]}${d.duracao_estimada_minutes != null ? `\nDuração: ${d.duracao_estimada_minutes}min` : ""}`}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      <div
        className={`group border-2 shadow-sm relative ${isStadium ? "" : "rounded-lg"} ${etapaClass} ${selected ? "ring-2 ring-blue-500 ring-offset-2 shadow-lg" : ""}`}
        style={{
          background: isDecision ? "transparent" : bg,
          borderColor: isDecision ? "transparent" : border,
          borderRadius: isStadium ? 9999 : undefined,
          color: textColor,
          width: d.largura ?? 200,
          height: d.altura,
          minWidth: 160,
          minHeight: 90,
          resize: "both",
          overflow: "hidden",
        }}
        onMouseUp={(e) => {
          const el = e.currentTarget;
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          if (w !== (d.largura ?? 200) || h !== d.altura) {
            d.onResize(id, w, h);
          }
        }}
      >
      {d.red_flag && (
        <Flag className="absolute -top-2 -right-2 h-5 w-5 text-red-600 fill-red-600 drop-shadow z-20" />
      )}
      {isDecision ? (
        <>
          <div
            className="absolute inset-0 m-auto"
            style={{ width: "70.7%", height: "70.7%", transform: "rotate(45deg)", background: bg, border: `2px solid ${border}`, zIndex: 0 }}
          />
          <div className="absolute inset-0 z-10 flex items-center justify-center text-center px-6 cursor-pointer" onClick={() => d.onOpen(id)}>
            <div className="text-sm font-medium whitespace-pre-wrap break-words" style={contentTextStyle}>
              {d.tipo === "tarefa"
                ? d.taskTitulo ?? (d.task_id ? "(tarefa)" : "Sem tarefa vinculada")
                : d.texto || "(decisão)"}
            </div>
          </div>
        </>
      ) : (
      <div className={`py-2 cursor-pointer ${isStadium ? "px-4" : "px-3"}`} onClick={() => d.onOpen(id)}>
        <div className="text-[10px] uppercase font-semibold opacity-60 flex items-center gap-1">
          {isComment ? <MessageSquare className="h-3 w-3" /> : d.tipo === "tarefa" ? <ListTodo className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
          {isComment ? "comentário" : `${d.tipo} · ${ETAPA_LABEL[d.etapa_tipo]}`}
          {!isComment && d.etapa_tipo === "inicio" && <Play className="h-3 w-3 text-green-600" />}
          {!isComment && d.etapa_tipo === "fim" && <Square className="h-3 w-3 text-red-600" />}
          {d.duracao_estimada_minutes != null && (
            <span className="ml-1 opacity-70">· {d.duracao_estimada_minutes}min</span>
          )}
        </div>
        <div className="text-sm font-medium whitespace-pre-wrap break-words" style={contentTextStyle}>
          {d.tipo === "tarefa"
            ? d.taskTitulo ?? (d.task_id ? "(tarefa)" : "Sem tarefa vinculada")
            : d.texto || (isComment ? "(comentário vazio)" : "(nota vazia)")}
        </div>
        {d.comentario && (
          <div className="text-[11px] italic opacity-70 mt-1 pt-1 border-t border-current/10">
            💬 {d.comentario}
          </div>
        )}
      </div>
      )}
      <div className={actionsClass}>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6"><Palette className="h-3 w-3" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 space-y-2">
            <div>
              <div className="text-[10px] uppercase opacity-60 mb-1">Fundo</div>
              <div className="grid grid-cols-5 gap-1">
                {COLORS.map((c) => (
                  <button key={c} className="h-6 w-6 rounded border-2"
                    style={{ background: COLOR_BG[c], borderColor: COLOR_BORDER[c] }}
                    onClick={() => d.onColorChange(id, c)} title={c} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase opacity-60 mb-1">Texto</div>
              <div className="flex gap-1">
                {TEXT_COLORS.map((c) => (
                  <button key={c} className="h-6 w-6 rounded border-2 flex items-center justify-center text-xs font-bold"
                    style={{ borderColor: TEXT_COLOR[c], color: TEXT_COLOR[c] }}
                    onClick={() => d.onTextColorChange(id, c)} title={c}>A</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase opacity-60 mb-1">Tamanho do texto</div>
              <Select value={String(d.font_size ?? "")} onValueChange={(v) => d.onFontSizeChange(id, v === "auto" ? null : Number(v))}>
                <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Padrão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Padrão</SelectItem>
                  {FONT_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}px</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[10px] uppercase opacity-60 mb-1">Estilo</div>
              <div className="flex gap-1">
                <Button size="sm" variant={d.negrito ? "default" : "outline"} className="h-7 px-2"
                  onClick={() => d.onBoldToggle(id)} title="Negrito">
                  <Bold className="h-3 w-3" />
                </Button>
                <Button size="sm" variant={d.sombra ? "default" : "outline"} className="h-7 px-2"
                  onClick={() => d.onShadowToggle(id)} title="Sombra no texto">
                  <span style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.6)" }}>S</span>
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button size="icon" variant="ghost" className="h-6 w-6"
          onClick={() => d.onRedFlagToggle(id)} title="Red flag">
          <Flag className={`h-3 w-3 ${d.red_flag ? "text-red-600 fill-red-600" : ""}`} />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Propriedades">
              <Settings className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3">
            {!isComment && (
              <div>
                <Label className="text-xs">Tipo de etapa</Label>
                <Select value={d.etapa_tipo} onValueChange={(v) => d.onEtapaChange(id, v as EtapaTipo)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inicio">▶ Início</SelectItem>
                    <SelectItem value="intermediaria">● Intermediária</SelectItem>
                    <SelectItem value="fim">■ Fim</SelectItem>
                    <SelectItem value="decisao">◆ Decisão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Duração estimada (min)</Label>
              <Input type="number" min={0} className="h-8"
                value={d.duracao_estimada_minutes ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  d.onDurationChange(id, Number.isFinite(v as number) ? (v as number) : null);
                }} />
            </div>
            <div>
              <Label className="text-xs">Comentário</Label>
              <Textarea rows={2} className="text-xs"
                value={d.comentario ?? ""}
                onChange={(e) => d.onCommentChange(id, e.target.value)} />
            </div>
          </PopoverContent>
        </Popover>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => d.onDelete(id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {!isComment && d.etapa_tipo !== "decisao" && (
        <div className="flex border-t border-current/10 nodrag">
          {(["inicio", "intermediaria", "fim"] as EtapaTipo[]).map((et) => (
            <button
              key={et}
              title={ETAPA_LABEL[et]}
              onClick={() => d.onEtapaChange(id, et)}
              className={`flex-1 text-[9px] py-0.5 font-semibold uppercase transition-colors ${
                d.etapa_tipo === et
                  ? et === "inicio"
                    ? "bg-green-500 text-white"
                    : et === "fim"
                      ? "bg-red-500 text-white"
                      : "bg-blue-400 text-white"
                  : "opacity-40 hover:opacity-70"
              }`}
            >
              {et === "inicio" ? "▶ Início" : et === "fim" ? "■ Fim" : "● Meio"}
            </button>
          ))}
        </div>
      )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
    </div>
  );
}

function LaneNode({ data }: NodeProps) {
  const d = data as unknown as { nome: string; tipo: "responsavel" | "fase"; index: number; width: number };
  const bg = LANE_BG[d.index % LANE_BG.length];
  const headerBg = LANE_HEADER_BG[d.index % LANE_HEADER_BG.length];
  return (
    <div
      style={{ width: d.width, height: LANE_HEIGHT, background: bg }}
      className="relative border-b-2 border-solid border-foreground/30"
    >
      {/* Nota: position:sticky não funciona aqui — .react-flow__viewport usa
          transform CSS pra pan/zoom, e transform em ancestral quebra sticky
          (comportamento de spec do CSS, não bug de implementação). A célula
          de cabeçalho fica fixa no início da raia em vez de acompanhar o
          scroll. */}
      <div
        style={{ width: LANE_HEADER_WIDTH, height: "100%", background: headerBg }}
        className="absolute left-0 top-0 border-r-2 border-solid border-foreground/30 flex flex-col items-center justify-center text-center px-2 gap-0.5"
      >
        <div className="text-xs font-semibold text-foreground">{d.nome}</div>
        <div className="text-[10px] uppercase font-medium text-foreground/70 bg-white/60 px-1.5 py-0.5 rounded">
          {d.tipo === "responsavel" ? "Responsável" : "Fase"}
        </div>
      </div>
    </div>
  );
}

/** Floating label rendered as a React Flow node so it pans/zooms with the canvas. */
function LabelNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as {
    text: string;
    color: string;
    onChange: (id: string, patch: Partial<FloatLabel>) => void;
    onDelete: (id: string) => void;
  };
  const [editing, setEditing] = useState(false);
  const labelId = id.replace(/^label-/, "");
  return (
    <div className={`group relative ${selected ? "ring-2 ring-blue-500" : ""}`}>
      {editing ? (
        <Textarea
          rows={2}
          autoFocus
          defaultValue={d.text}
          onBlur={(e) => { d.onChange(labelId, { text: e.target.value }); setEditing(false); }}
          className="text-sm min-w-[120px] nodrag"
          style={{ color: d.color, borderColor: d.color }}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-md bg-yellow-50 border border-dashed shadow-sm text-sm font-medium cursor-move"
          style={{ color: d.color, borderColor: d.color }}
        >
          {d.text || "(etiqueta)"}
        </div>
      )}
      <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1 nodrag">
        <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border" onClick={() => setEditing(true)} title="Editar">
          <Type className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border text-destructive" onClick={() => d.onDelete(labelId)} title="Remover">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Caixa de texto livre (Fase 3) — nó real do RF (não overlay SVG), pra edição
 * de texto/fonte funcionar bem e ganhar drag/resize/seleção de graça do RF. */
function TextBoxNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as {
    text: string; color: string; fontFamily: string; fontSize: number;
    orientation: "horizontal" | "vertical"; w: number; h: number;
    onChange: (id: string, patch: Partial<TextBox>) => void;
    onDelete: (id: string) => void;
    autoEdit?: boolean;
  };
  // Lazy init: só olha autoEdit no momento em que este nó nasce (recém-
  // criado pela ferramenta "Texto"), estilo Paint — abre direto editando.
  const [editing, setEditing] = useState(() => !!d.autoEdit);
  const tbId = id.replace(/^textbox-/, "");
  const textStyle = {
    color: d.color, fontFamily: d.fontFamily, fontSize: d.fontSize,
    writingMode: d.orientation === "vertical" ? "vertical-rl" as const : "horizontal-tb" as const,
  };
  return (
    <div
      className={`group relative bg-white/80 border border-dashed rounded-md p-2 ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ width: d.w, height: d.h, minWidth: 80, minHeight: 40, resize: "both", overflow: "hidden" }}
      onMouseUp={(e) => {
        const el = e.currentTarget;
        if (el.offsetWidth !== d.w || el.offsetHeight !== d.h) d.onChange(tbId, { w: el.offsetWidth, h: el.offsetHeight });
      }}
    >
      {editing ? (
        <Textarea
          rows={3}
          autoFocus
          defaultValue={d.text}
          onBlur={(e) => { d.onChange(tbId, { text: e.target.value }); setEditing(false); }}
          className="text-sm nodrag h-full"
          style={textStyle}
        />
      ) : (
        <div onDoubleClick={() => setEditing(true)} className="cursor-move h-full whitespace-pre-wrap break-words" style={textStyle}>
          {d.text || "(texto vazio)"}
        </div>
      )}
      <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1 nodrag">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border" title="Cor"><Palette className="h-3 w-3" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-5 gap-1">
              {DRAW_COLORS.map((c) => (
                <button key={c} className="h-6 w-6 rounded border-2" style={{ background: c, borderColor: c }}
                  onClick={() => d.onChange(tbId, { color: c })} title={c} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border" title="Fonte e tamanho"><Settings className="h-3 w-3" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 space-y-2 nodrag">
            <div>
              <Label className="text-xs">Fonte</Label>
              <Select value={d.fontFamily} onValueChange={(v) => d.onChange(tbId, { fontFamily: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((f) => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f.split(",")[0].replace(/'/g, "")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tamanho</Label>
              <Select value={String(d.fontSize)} onValueChange={(v) => d.onChange(tbId, { fontSize: Number(v) })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}px</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
        <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border" title="Orientação"
          onClick={() => d.onChange(tbId, { orientation: d.orientation === "vertical" ? "horizontal" : "vertical" })}>
          <Type className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border text-destructive" onClick={() => d.onDelete(tbId)} title="Remover">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Imagem colada (Fase 4) — mesmo padrão de redimensionar do FlowNode. */
function ImageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as {
    url?: string; w: number; h: number;
    onDelete: (id: string) => void;
    onResize: (id: string, w: number, h: number) => void;
  };
  const imgId = id.replace(/^image-/, "");
  return (
    <div
      className={`group relative border rounded-md bg-white shadow-sm ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ width: d.w, height: d.h, minWidth: 60, minHeight: 60, resize: "both", overflow: "hidden" }}
      onMouseUp={(e) => {
        const el = e.currentTarget;
        if (el.offsetWidth !== d.w || el.offsetHeight !== d.h) d.onResize(imgId, el.offsetWidth, el.offsetHeight);
      }}
    >
      {d.url ? (
        <img src={d.url} alt="Imagem colada" className="w-full h-full object-contain nodrag" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Carregando…</div>
      )}
      <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1 nodrag">
        <Button size="icon" variant="ghost" className="h-5 w-5 bg-white border text-destructive" onClick={() => d.onDelete(imgId)} title="Remover">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

const nodeTypes = { flow: FlowNode, lane: LaneNode, label: LabelNode, textbox: TextBoxNode, image: ImageNode };

function ProcessFlowEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

/** Draw overlay synchronized with React Flow viewport transform. */
/** Ponta de seta manual (triângulo rotacionado) — SVG <marker> não reherda a cor por-forma de forma confiável. */
function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number, size = 12): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + (Math.PI * 5) / 6;
  const a2 = angle - (Math.PI * 5) / 6;
  return `${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`;
}

function ShapeSvg({ s, extraProps }: { s: Shape; extraProps?: Record<string, unknown> }) {
  const x = Math.min(s.x, s.x + s.w);
  const y = Math.min(s.y, s.y + s.h);
  const w = Math.abs(s.w);
  const h = Math.abs(s.h);
  const common = { stroke: s.color, strokeWidth: s.width, opacity: s.opacity, ...extraProps };
  if (s.kind === "rect") return <rect x={x} y={y} width={w} height={h} fill={s.fill ?? "none"} {...common} />;
  if (s.kind === "ellipse") {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={s.fill ?? "none"} {...common} />;
  }
  if (s.kind === "arrow") {
    return (
      <g {...(extraProps ?? {})}>
        <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke={s.color} strokeWidth={s.width} opacity={s.opacity} />
        <polygon points={arrowHeadPoints(s.x, s.y, s.x + s.w, s.y + s.h)} fill={s.color} opacity={s.opacity} />
      </g>
    );
  }
  // line
  return <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} fill="none" {...common} />;
}

function DrawingOverlay({
  tool,
  color,
  width,
  opacity,
  fill,
  strokes,
  shapes,
  onStrokeEnd,
  onShapeEnd,
  onEraseStroke,
  onEraseShape,
  onTextBoxRect,
  containerRef,
}: {
  tool: ToolMode;
  color: string;
  width: number;
  opacity: number;
  fill: string | null;
  strokes: Stroke[];
  shapes: Shape[];
  onStrokeEnd: (s: Stroke) => void;
  onShapeEnd: (s: Shape) => void;
  onEraseStroke: (id: string) => void;
  onEraseShape: (id: string) => void;
  onTextBoxRect: (r: { x: number; y: number; w: number; h: number }) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const { x, y, zoom } = useViewport();
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const eraseMode = tool === "erase";
  const isShapeTool = (SHAPE_TOOLS as readonly string[]).includes(tool);
  const isTextTool = tool === "text";
  const enabled = tool === "pencil" || isShapeTool || eraseMode || isTextTool;

  const flowPoint = useCallback((clientX: number, clientY: number) => {
    const p = screenToFlowPosition({ x: clientX, y: clientY });
    return [p.x, p.y] as [number, number];
  }, [screenToFlowPosition]);

  useEffect(() => {
    if (!enabled || eraseMode) return;
    const el = containerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const [px, py] = flowPoint(e.clientX, e.clientY);
      if (tool === "pencil") {
        setCurrentStroke({ id: crypto.randomUUID(), color, width, opacity, points: [[px, py]] });
      } else if (isShapeTool) {
        setCurrentShape({ id: crypto.randomUUID(), kind: tool as ShapeKind, x: px, y: py, w: 0, h: 0, color, fill, width, opacity });
      } else if (isTextTool) {
        // Prévia tracejada azul só de exibição — nunca vira uma forma persistida.
        setCurrentShape({ id: "text-preview", kind: "rect", x: px, y: py, w: 0, h: 0, color: "#3b82f6", fill: null, width: 1.5, opacity: 0.8 });
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const [px, py] = flowPoint(e.clientX, e.clientY);
      if (tool === "pencil") {
        setCurrentStroke((c) => c ? { ...c, points: [...c.points, [px, py]] } : c);
      } else if (isShapeTool || isTextTool) {
        setCurrentShape((c) => c ? { ...c, w: px - c.x, h: py - c.y } : c);
      }
    };
    const onUp = () => {
      setCurrentStroke((c) => {
        if (c && c.points.length > 1) onStrokeEnd(c);
        return null;
      });
      setCurrentShape((c) => {
        if (!c) return null;
        if (isTextTool) {
          const w = Math.abs(c.w);
          const h = Math.abs(c.h);
          // Arraste pequeno (ou só um clique): usa um tamanho padrão em vez
          // de criar uma caixa minúscula sem querer.
          const rect = w > 20 && h > 20
            ? { x: Math.min(c.x, c.x + c.w), y: Math.min(c.y, c.y + c.h), w, h }
            : { x: c.x, y: c.y, w: 220, h: 90 };
          onTextBoxRect(rect);
        } else if (isShapeTool && (Math.abs(c.w) > 2 || Math.abs(c.h) > 2)) {
          onShapeEnd(c);
        }
        return null;
      });
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled, eraseMode, tool, isShapeTool, isTextTool, color, width, opacity, fill, flowPoint, onStrokeEnd, onShapeEnd, onTextBoxRect, containerRef]);

  const toPath = (pts: [number, number][]) =>
    pts.length === 0 ? "" : `M ${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(" ");

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: enabled ? "auto" : "none", zIndex: 5, cursor: enabled ? "crosshair" : "default" }}
    >
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {strokes.map((s) => (
          <path
            key={s.id}
            d={toPath(s.points)}
            stroke={s.color}
            strokeWidth={s.width}
            opacity={s.opacity}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: eraseMode ? "stroke" : "none", cursor: eraseMode ? "pointer" : "default" }}
            onClick={() => eraseMode && onEraseStroke(s.id)}
          />
        ))}
        {shapes.map((s) => (
          <ShapeSvg
            key={s.id}
            s={s}
            extraProps={{
              style: { pointerEvents: eraseMode ? "all" : "none", cursor: eraseMode ? "pointer" : "default" },
              onClick: () => eraseMode && onEraseShape(s.id),
            }}
          />
        ))}
        {currentStroke && (
          <path
            d={toPath(currentStroke.points)}
            stroke={currentStroke.color}
            strokeWidth={currentStroke.width}
            opacity={currentStroke.opacity}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {currentShape && (
          <ShapeSvg s={currentShape} extraProps={isTextTool ? { strokeDasharray: "6 4" } : undefined} />
        )}
      </g>
    </svg>
  );
}

function EditorInner() {
  const { id: flowId } = Route.useParams();
  const qc = useQueryClient();
  const { getNodes, screenToFlowPosition, setCenter, getZoom } = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);
  const ctx = useRouteContext({ from: "/_authenticated" });
  const user = ctx.user;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  // Trava "só carrega uma vez": sem isso, qualquer refetch em segundo plano
  // de `flow` (React Query com staleTime:0 + refetchOnWindowFocus, ver
  // router.tsx) reaplicava os dados antigos do banco por cima de uma
  // etiqueta/traço recém-adicionado que ainda não tinha round-trip completo
  // — é a causa raiz do bug "clico em Etiqueta e não aparece nada".
  const extrasLoadedRef = useRef(false);

  const [pickTaskOpen, setPickTaskOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [taskCardOpen, setTaskCardOpen] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [edgeLabelDialogOpen, setEdgeLabelDialogOpen] = useState(false);
  const [edgeLabelEditId, setEdgeLabelEditId] = useState<string | null>(null);
  const [edgeLabelText, setEdgeLabelText] = useState("");

  // Drawing & annotations (persisted em bloco em process_flows.canvas_extras)
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [labels, setLabels] = useState<FloatLabel[]>([]);
  const [textboxes, setTextboxes] = useState<TextBox[]>([]);
  const [images, setImages] = useState<PastedImage[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const signedForRef = useRef<Set<string>>(new Set());
  const [tool, setTool] = useState<ToolMode>("select");
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState<DrawWidthKey>("media");
  const [drawOpacity, setDrawOpacity] = useState(1);
  const [fillColor, setFillColor] = useState<string | null>(null);
  const isShapeToolActive = (SHAPE_TOOLS as readonly string[]).includes(tool);
  const isDrawingTool = tool === "pencil" || isShapeToolActive;
  const isBlockingTool = isDrawingTool || tool === "erase" || tool === "text";

  // Desfazer/Refazer: histórico combinado de nodes/edges/strokes/shapes/
  // labels/textboxes/images — cobre criar/mover/apagar, não cada edição de
  // propriedade (cor/comentário/etc), pra não virar 1-undo-por-clique.
  type HistorySnapshot = {
    nodes: Node[]; edges: Edge[]; strokes: Stroke[]; shapes: Shape[];
    labels: FloatLabel[]; textboxes: TextBox[]; images: PastedImage[];
  };
  const historyRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const suppressHistoryRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0); // força re-render pra habilitar/desabilitar botões

  const { data: flow } = useQuery({
    queryKey: ["process_flow", flowId],
    queryFn: async () => {
      const { data, error } = await supabase.from("process_flows").select("*").eq("id", flowId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lanes = [], refetch: refetchLanes } = useQuery({
    queryKey: ["process_flow_lanes", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_flow_lanes").select("*").eq("flow_id", flowId).order("ordem", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks").select("id,titulo,status").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as { id: string; titulo: string; status: string }[];
    },
  });

  const taskMap = useMemo(() => {
    const m = new Map<string, string>();
    tasks.forEach((t) => m.set(t.id, t.titulo));
    return m;
  }, [tasks]);

  const updateNodeRemote = useCallback(
    async (id: string, patch: Partial<{
      cor: FlowColor; cor_texto: TextColor; red_flag: boolean; texto: string;
      comentario: string | null;
      posicao_x: number; posicao_y: number;
      duracao_estimada_minutes: number | null;
      etapa_tipo: EtapaTipo;
      lane_id: string | null;
      largura_px: number;
      altura_px: number;
      font_size: number | null;
      negrito: boolean;
      sombra: boolean;
    }>) => {
      setSaving(true);
      const { error } = await supabase.from("process_flow_nodes").update(patch).eq("id", id);
      setSaving(false);
      if (error) toast.error("Erro ao salvar", { description: error.message });
      else setSavedAt(new Date());
    },
    [],
  );

  // Debounced save of canvas_extras
  const extrasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveExtras = useCallback((next: CanvasExtras) => {
    if (extrasTimer.current) clearTimeout(extrasTimer.current);
    extrasTimer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase.from("process_flows").update({ canvas_extras: next as never }).eq("id", flowId);
      setSaving(false);
      if (error) toast.error("Erro ao salvar canvas", { description: error.message });
      else setSavedAt(new Date());
    }, 600);
  }, [flowId]);

  const strokesRef = useRef<Stroke[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  const labelsRef = useRef<FloatLabel[]>([]);
  const textboxesRef = useRef<TextBox[]>([]);
  const imagesRef = useRef<PastedImage[]>([]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { textboxesRef.current = textboxes; }, [textboxes]);
  useEffect(() => { imagesRef.current = images; }, [images]);

  // Toda gravação manda o blob inteiro (saveExtras substitui canvas_extras
  // por completo) — um único ponto lendo todos os *Ref evita esquecer um
  // campo numa gravação futura (ver plano: risco de perda silenciosa de dado).
  const persistAll = useCallback((overrides?: Partial<CanvasExtras>) => {
    saveExtras({
      strokes: strokesRef.current,
      shapes: shapesRef.current,
      labels: labelsRef.current,
      textboxes: textboxesRef.current,
      images: imagesRef.current,
      ...overrides,
    });
  }, [saveExtras]);

  const pushHistory = useCallback(() => {
    if (suppressHistoryRef.current) return;
    historyRef.current.push({
      nodes, edges, strokes: strokesRef.current, shapes: shapesRef.current,
      labels: labelsRef.current, textboxes: textboxesRef.current, images: imagesRef.current,
    });
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, [nodes, edges]);

  const applySnapshot = useCallback((snap: HistorySnapshot) => {
    suppressHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setStrokes(snap.strokes);
    setShapes(snap.shapes);
    setLabels(snap.labels);
    setTextboxes(snap.textboxes);
    setImages(snap.images);
    persistAll({
      strokes: snap.strokes, shapes: snap.shapes, labels: snap.labels,
      textboxes: snap.textboxes, images: snap.images,
    });
    // Reposições de nós desfeitas/refeitas também precisam voltar pro banco,
    // senão o banco fica dessincronizado do estado local até a próxima
    // gravação não relacionada.
    for (const n of snap.nodes) {
      if (n.type === "flow") {
        updateNodeRemote(n.id, { posicao_x: n.position.x, posicao_y: n.position.y });
      }
    }
    setTimeout(() => { suppressHistoryRef.current = false; }, 0);
  }, [setNodes, setEdges, persistAll, updateNodeRemote]);

  const undo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    futureRef.current.push({
      nodes, edges, strokes: strokesRef.current, shapes: shapesRef.current,
      labels: labelsRef.current, textboxes: textboxesRef.current, images: imagesRef.current,
    });
    applySnapshot(snap);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges, applySnapshot]);

  const redo = useCallback(() => {
    const snap = futureRef.current.pop();
    if (!snap) return;
    historyRef.current.push({
      nodes, edges, strokes: strokesRef.current, shapes: shapesRef.current,
      labels: labelsRef.current, textboxes: textboxesRef.current, images: imagesRef.current,
    });
    applySnapshot(snap);
    setHistoryTick((t) => t + 1);
  }, [nodes, edges, applySnapshot]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // Resolve URLs assinadas em lote pra imagens coladas ainda sem URL — só
  // pros paths novos (signedForRef evita re-assinar a cada re-render).
  useEffect(() => {
    const pending = images.map((i) => i.storagePath).filter((p) => !signedForRef.current.has(p));
    if (pending.length === 0) return;
    (async () => {
      pending.forEach((p) => signedForRef.current.add(p));
      const { data, error } = await supabase.storage.from("task-attachments").createSignedUrls(pending, 3600);
      if (error) { toast.error("Erro ao carregar imagem", { description: error.message }); return; }
      setImageUrls((prev) => {
        const next = { ...prev };
        for (const r of data ?? []) {
          if (r.signedUrl && r.path) next[r.path] = r.signedUrl;
        }
        return next;
      });
    })();
  }, [images]);

  // Colar screenshot/imagem direto no canvas (Ctrl+V) — mesmo padrão de
  // handlePaste do TaskForm.tsx, mas upload IMEDIATO (o canvas não tem um
  // "salvar" explícito como o formulário de tarefa).
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!user || !e.clipboardData) return;
      const items = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/"));
      if (items.length === 0) return;
      e.preventDefault();
      for (const item of items) {
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > MAX_PASTE_IMAGE_BYTES) {
          toast.error("Imagem muito grande", { description: "Máximo de 10MB por imagem." });
          continue;
        }
        const path = `${user.id}/flow-${flowId}/${Date.now()}-pasted.png`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
        if (upErr) { toast.error("Erro ao colar imagem", { description: upErr.message }); continue; }
        const wrap = flowWrapper.current?.getBoundingClientRect();
        const p = wrap
          ? screenToFlowPosition({ x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2 })
          : { x: 200, y: 200 };
        const next: PastedImage = { id: crypto.randomUUID(), x: p.x, y: p.y, w: 300, h: 200, storagePath: path };
        pushHistory();
        setImages((imgs) => {
          const arr = [...imgs, next];
          persistAll({ images: arr });
          return arr;
        });
        toast.success("Imagem colada no canvas");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [user, flowId, screenToFlowPosition, persistAll, pushHistory]);

  const handleColorChange = useCallback((id: string, cor: FlowColor) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, cor } } : n)));
    updateNodeRemote(id, { cor });
  }, [setNodes, updateNodeRemote]);

  const handleTextColorChange = useCallback((id: string, cor_texto: TextColor) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, cor_texto } } : n)));
    updateNodeRemote(id, { cor_texto });
  }, [setNodes, updateNodeRemote]);

  const handleRedFlagToggle = useCallback((id: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== id) return n;
      const newVal = !(n.data as unknown as NodeData).red_flag;
      updateNodeRemote(id, { red_flag: newVal });
      return { ...n, data: { ...n.data, red_flag: newVal } };
    }));
  }, [setNodes, updateNodeRemote]);

  const handleDurationChange = useCallback((id: string, minutes: number | null) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, duracao_estimada_minutes: minutes } } : n));
    updateNodeRemote(id, { duracao_estimada_minutes: minutes });
  }, [setNodes, updateNodeRemote]);

  const handleFontSizeChange = useCallback((id: string, size: number | null) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, font_size: size } } : n));
    updateNodeRemote(id, { font_size: size });
  }, [setNodes, updateNodeRemote]);

  const handleBoldToggle = useCallback((id: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== id) return n;
      const newVal = !(n.data as unknown as NodeData).negrito;
      updateNodeRemote(id, { negrito: newVal });
      return { ...n, data: { ...n.data, negrito: newVal } };
    }));
  }, [setNodes, updateNodeRemote]);

  const handleShadowToggle = useCallback((id: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== id) return n;
      const newVal = !(n.data as unknown as NodeData).sombra;
      updateNodeRemote(id, { sombra: newVal });
      return { ...n, data: { ...n.data, sombra: newVal } };
    }));
  }, [setNodes, updateNodeRemote]);

  const handleEtapaChange = useCallback((id: string, etapa: EtapaTipo) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== id) return n;
      const d = n.data as unknown as NodeData;
      // Losango de decisão precisa de mais espaço pro texto — só aplica o
      // tamanho maior se o usuário ainda não redimensionou o nó manualmente.
      const growForDecision = etapa === "decisao" && d.largura == null && d.altura == null;
      const sizePatch = growForDecision ? { largura: 180, altura: 120 } : {};
      updateNodeRemote(id, {
        etapa_tipo: etapa,
        ...(growForDecision ? { largura_px: 180, altura_px: 120 } : {}),
      });
      return { ...n, data: { ...n.data, etapa_tipo: etapa, ...sizePatch } };
    }));
  }, [setNodes, updateNodeRemote]);

  const handleResize = useCallback((id: string, w: number, h: number) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, largura: w, altura: h } } : n));
    updateNodeRemote(id, { largura_px: w, altura_px: h });
  }, [setNodes, updateNodeRemote]);

  const commentTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleCommentChange = useCallback((id: string, comentario: string) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, comentario } } : n));
    if (commentTimer.current[id]) clearTimeout(commentTimer.current[id]);
    commentTimer.current[id] = setTimeout(() => updateNodeRemote(id, { comentario: comentario || null }), 500);
  }, [setNodes, updateNodeRemote]);

  const handleDeleteNode = useCallback(async (id: string) => {
    pushHistory();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    await supabase.from("process_flow_nodes").delete().eq("id", id);
  }, [setNodes, setEdges, pushHistory]);

  const handleOpenNode = useCallback((id: string) => {
    setNodes((current) => {
      const node = current.find((n) => n.id === id);
      if (!node) return current;
      const d = node.data as unknown as NodeData;
      if (d.tipo === "tarefa" && d.task_id) {
        setTaskCardOpen(d.task_id);
      } else if (d.tipo === "nota" || d.tipo === "comentario") {
        setNoteEditId(id);
        setNoteText(d.texto || "");
        setNoteDialogOpen(true);
      }
      return current;
    });
  }, [setNodes]);

  const decorateNode = useCallback((row: any): Node => ({
    id: row.id,
    type: "flow",
    position: { x: row.posicao_x, y: row.posicao_y },
    data: {
      tipo: row.tipo,
      texto: row.texto,
      task_id: row.task_id,
      taskTitulo: row.task_id ? taskMap.get(row.task_id) ?? null : null,
      cor: row.cor as FlowColor,
      cor_texto: (row.cor_texto ?? "black") as TextColor,
      comentario: row.comentario ?? null,
      red_flag: row.red_flag,
      duracao_estimada_minutes: row.duracao_estimada_minutes ?? null,
      etapa_tipo: (row.etapa_tipo ?? "intermediaria") as EtapaTipo,
      largura: row.largura_px ?? undefined,
      altura: row.altura_px ?? undefined,
      font_size: row.font_size ?? null,
      negrito: row.negrito ?? false,
      sombra: row.sombra ?? false,
      onColorChange: handleColorChange,
      onTextColorChange: handleTextColorChange,
      onRedFlagToggle: handleRedFlagToggle,
      onDelete: handleDeleteNode,
      onOpen: handleOpenNode,
      onDurationChange: handleDurationChange,
      onEtapaChange: handleEtapaChange,
      onCommentChange: handleCommentChange,
      onResize: handleResize,
      onFontSizeChange: handleFontSizeChange,
      onBoldToggle: handleBoldToggle,
      onShadowToggle: handleShadowToggle,
    } as NodeData as unknown as Record<string, unknown>,
  }), [
    taskMap, handleColorChange, handleTextColorChange, handleRedFlagToggle, handleDeleteNode,
    handleOpenNode, handleDurationChange, handleEtapaChange, handleCommentChange, handleResize,
    handleFontSizeChange, handleBoldToggle, handleShadowToggle,
  ]);

  useEffect(() => {
    if (loaded) return;
    (async () => {
      const [{ data: nRows }, { data: eRows }] = await Promise.all([
        supabase.from("process_flow_nodes").select("*").eq("flow_id", flowId),
        supabase.from("process_flow_edges").select("*").eq("flow_id", flowId),
      ]);
      setNodes((nRows ?? []).map(decorateNode));
      setEdges((eRows ?? []).map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
        animated: false,
        style: { strokeWidth: 2 },
        label: e.label ?? undefined,
      })));
      setLoaded(true);
    })();
  }, [flowId, loaded, decorateNode, setNodes, setEdges]);

  useEffect(() => {
    if (!flow || extrasLoadedRef.current) return;
    const extras = (flow.canvas_extras as CanvasExtras | null) ?? {};
    setStrokes((extras.strokes ?? []).map((s) => ({ ...s, opacity: s.opacity ?? 1 })));
    setShapes(extras.shapes ?? []);
    setLabels(extras.labels ?? []);
    setTextboxes(extras.textboxes ?? []);
    setImages(extras.images ?? []);
    extrasLoadedRef.current = true;
  }, [flow]);

  useEffect(() => {
    if (!loaded) return;
    setNodes((nds) => nds.map((n) => {
      const d = n.data as unknown as NodeData;
      if (d.tipo !== "tarefa" || !d.task_id) return n;
      return { ...n, data: { ...d, taskTitulo: taskMap.get(d.task_id) ?? null } as unknown as Record<string, unknown> };
    }));
  }, [taskMap, loaded, setNodes]);

  const onConnect = useCallback(async (params: Connection) => {
    if (!params.source || !params.target) return;
    const { data, error } = await supabase
      .from("process_flow_edges")
      .insert({ flow_id: flowId, source_node_id: params.source, target_node_id: params.target })
      .select("id").single();
    if (error) { toast.error("Erro ao conectar", { description: error.message }); return; }
    setEdges((eds) => addEdge({
      ...params,
      id: data.id,
      animated: true,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
      style: { strokeWidth: 2 },
    }, eds));
    setTimeout(() => setEdges((eds) => eds.map((e) => e.id === data.id ? { ...e, animated: false } : e)), 600);
  }, [flowId, setEdges]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    pushHistory();
    for (const e of deleted) await supabase.from("process_flow_edges").delete().eq("id", e.id);
  }, [pushHistory]);

  const onEdgeDoubleClick = useCallback((_: unknown, edge: Edge) => {
    setEdgeLabelEditId(edge.id);
    setEdgeLabelText(typeof edge.label === "string" ? edge.label : "");
    setEdgeLabelDialogOpen(true);
  }, []);

  async function saveEdgeLabel() {
    if (!edgeLabelEditId) return;
    const value = edgeLabelText.trim() || null;
    const { error } = await supabase.from("process_flow_edges").update({ label: value }).eq("id", edgeLabelEditId);
    if (error) { toast.error("Erro ao rotular seta", { description: error.message }); return; }
    setEdges((eds) => eds.map((e) => e.id === edgeLabelEditId ? { ...e, label: value ?? undefined } : e));
    setEdgeLabelDialogOpen(false);
    setEdgeLabelEditId(null);
  }

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "lane") return;
    pushHistory();
    if (node.type === "label") {
      const labelId = node.id.replace(/^label-/, "");
      setLabels((ls) => {
        const next = ls.map((l) => l.id === labelId ? { ...l, x: node.position.x, y: node.position.y } : l);
        persistAll({ labels: next });
        return next;
      });
      return;
    }
    if (node.type === "textbox") {
      const tbId = node.id.replace(/^textbox-/, "");
      setTextboxes((ts) => {
        const next = ts.map((t) => t.id === tbId ? { ...t, x: node.position.x, y: node.position.y } : t);
        persistAll({ textboxes: next });
        return next;
      });
      return;
    }
    if (node.type === "image") {
      const imgId = node.id.replace(/^image-/, "");
      setImages((imgs) => {
        const next = imgs.map((i) => i.id === imgId ? { ...i, x: node.position.x, y: node.position.y } : i);
        persistAll({ images: next });
        return next;
      });
      return;
    }
    let lane_id: string | null = null;
    if (lanes.length > 0) {
      const idx = Math.max(0, Math.min(lanes.length - 1, Math.floor(node.position.y / LANE_HEIGHT)));
      lane_id = lanes[idx]?.id ?? null;
      const snapMin = idx * LANE_HEIGHT + 20;
      const snapMax = (idx + 1) * LANE_HEIGHT - 80;
      const clampedY = Math.min(Math.max(node.position.y, snapMin), snapMax);
      if (clampedY !== node.position.y) {
        setNodes((nds) => nds.map((n) =>
          n.id === node.id ? { ...n, position: { ...n.position, y: clampedY } } : n
        ));
        updateNodeRemote(node.id, { posicao_x: node.position.x, posicao_y: clampedY, lane_id });
        return;
      }
    }
    updateNodeRemote(node.id, {
      posicao_x: node.position.x, posicao_y: node.position.y, lane_id,
    });
  }, [updateNodeRemote, lanes, persistAll, setNodes, pushHistory]);

  async function addNoteNode() {
    const center = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
    const { data, error } = await supabase.from("process_flow_nodes").insert({
      flow_id: flowId, tipo: "nota", texto: "Nova nota",
      posicao_x: center.x, posicao_y: center.y, cor: "amber", etapa_tipo: "intermediaria",
    }).select("*").single();
    if (error) return toast.error("Erro", { description: error.message });
    setNodes((nds) => [...nds, decorateNode(data)]);
  }

  async function addCommentNode() {
    const center = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
    const { data, error } = await supabase.from("process_flow_nodes").insert({
      flow_id: flowId, tipo: "comentario", texto: "Comentário",
      posicao_x: center.x, posicao_y: center.y, cor: "gray", etapa_tipo: "intermediaria",
    }).select("*").single();
    if (error) return toast.error("Erro", { description: error.message });
    setNodes((nds) => [...nds, decorateNode(data)]);
  }

  async function addTaskNode(task: { id: string; titulo: string }) {
    const center = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
    const { data, error } = await supabase.from("process_flow_nodes").insert({
      flow_id: flowId, tipo: "tarefa", task_id: task.id,
      posicao_x: center.x, posicao_y: center.y, cor: "blue", etapa_tipo: "intermediaria",
    }).select("*").single();
    if (error) return toast.error("Erro", { description: error.message });
    setNodes((nds) => [...nds, decorateNode(data)]);
    setPickTaskOpen(false);
  }

  const addFloatLabel = useCallback(() => {
    const wrap = flowWrapper.current?.getBoundingClientRect();
    const p = wrap
      ? screenToFlowPosition({ x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2 })
      : { x: 200, y: 200 };
    const next: FloatLabel = { id: crypto.randomUUID(), x: p.x, y: p.y, text: "Nova etiqueta", color: "#b45309" };
    pushHistory();
    setLabels((ls) => {
      const arr = [...ls, next];
      persistAll({ labels: arr });
      return arr;
    });
    // Centraliza a view no item recém-criado — sem isso, dependendo do
    // zoom/pan atual, o usuário não percebe que algo foi criado.
    setCenter(p.x, p.y, { zoom: Math.max(getZoom(), 0.5), duration: 300 });
    toast.success("Etiqueta criada");
  }, [screenToFlowPosition, persistAll, pushHistory, setCenter, getZoom]);

  const updateLabel = useCallback((id: string, patch: Partial<FloatLabel>) => {
    setLabels((ls) => {
      const next = ls.map((l) => l.id === id ? { ...l, ...patch } : l);
      persistAll({ labels: next });
      return next;
    });
  }, [persistAll]);

  const deleteLabel = useCallback((id: string) => {
    pushHistory();
    setLabels((ls) => {
      const next = ls.filter((l) => l.id !== id);
      persistAll({ labels: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  // Traços/formas: apagar um por vez com a ferramenta "Apagar" (sem modelo
  // de seleção/arraste — decisão de escopo combinada com o usuário).
  const handleStrokeEnd = useCallback((s: Stroke) => {
    pushHistory();
    setStrokes((prev) => {
      const next = [...prev, s];
      persistAll({ strokes: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  const handleEraseStroke = useCallback((id: string) => {
    pushHistory();
    setStrokes((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persistAll({ strokes: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  const handleShapeEnd = useCallback((s: Shape) => {
    pushHistory();
    setShapes((prev) => {
      const next = [...prev, s];
      persistAll({ shapes: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  const handleEraseShape = useCallback((id: string) => {
    pushHistory();
    setShapes((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persistAll({ shapes: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  // Caixa de texto livre (Fase 3): mesmo padrão de add/update/delete das
  // etiquetas, renderizada como nó real do React Flow (drag/resize grátis).
  // Caixa de texto (Fase 3, redesenhada): estilo Paint — o usuário ativa a
  // ferramenta "Texto" e ARRASTA no canvas pra definir posição+tamanho (o
  // DrawingOverlay cuida do gesto e chama createTextBoxAt com o retângulo
  // já em coordenadas de fluxo). Sem isso, criar sempre no centro da tela
  // dependia de recentralizar a câmera "na mão" — mais frágil e menos
  // previsível que deixar o próprio usuário escolher onde/quão grande.
  const [justCreatedTextBoxId, setJustCreatedTextBoxId] = useState<string | null>(null);
  const createTextBoxAt = useCallback((r: { x: number; y: number; w: number; h: number }) => {
    const next: TextBox = {
      id: crypto.randomUUID(), x: r.x, y: r.y, w: Math.max(r.w, 80), h: Math.max(r.h, 40),
      text: "", color: "#111827", fontFamily: FONT_FAMILIES[0], fontSize: 16, orientation: "horizontal",
    };
    pushHistory();
    setTextboxes((ts) => {
      const arr = [...ts, next];
      persistAll({ textboxes: arr });
      return arr;
    });
    setJustCreatedTextBoxId(next.id);
    setTool("select"); // volta pro ponteiro depois de posicionar, já em modo de edição
  }, [persistAll, pushHistory]);

  // TextBoxNode só lê justCreatedTextBoxId no PRIMEIRO render (useState
  // lazy init) pra decidir se abre editando — depois disso pode limpar sem
  // afetar o nó que já nasceu em modo de edição.
  useEffect(() => {
    if (!justCreatedTextBoxId) return;
    const t = setTimeout(() => setJustCreatedTextBoxId(null), 200);
    return () => clearTimeout(t);
  }, [justCreatedTextBoxId]);

  const updateTextBox = useCallback((id: string, patch: Partial<TextBox>) => {
    setTextboxes((ts) => {
      const next = ts.map((t) => t.id === id ? { ...t, ...patch } : t);
      persistAll({ textboxes: next });
      return next;
    });
  }, [persistAll]);

  const deleteTextBox = useCallback((id: string) => {
    pushHistory();
    setTextboxes((ts) => {
      const next = ts.filter((t) => t.id !== id);
      persistAll({ textboxes: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  // Imagem colada (Fase 4) — não apaga o objeto no Storage ao remover do
  // canvas (fica órfão de propósito, pra Desfazer conseguir restaurar).
  const deleteImage = useCallback((id: string) => {
    pushHistory();
    setImages((imgs) => {
      const next = imgs.filter((i) => i.id !== id);
      persistAll({ images: next });
      return next;
    });
  }, [persistAll, pushHistory]);

  const updateImage = useCallback((id: string, w: number, h: number) => {
    setImages((imgs) => {
      const next = imgs.map((i) => i.id === id ? { ...i, w, h } : i);
      persistAll({ images: next });
      return next;
    });
  }, [persistAll]);

  // Ferramenta "Selecionar": tecla Delete numa seleção de nós reais do React
  // Flow (tarefa/nota/comentário, etiqueta, caixa de texto, imagem) não tinha
  // NENHUM handler antes — removia só do estado local do RF, sem sincronizar
  // com o banco nem com labels/textboxes/images. Raias (type "lane") já são
  // `selectable: false`, nunca chegam aqui.
  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const n of deleted) {
      if (n.type === "flow") handleDeleteNode(n.id);
      else if (n.type === "label") deleteLabel(n.id.replace(/^label-/, ""));
      else if (n.type === "textbox") deleteTextBox(n.id.replace(/^textbox-/, ""));
      else if (n.type === "image") deleteImage(n.id.replace(/^image-/, ""));
    }
  }, [handleDeleteNode, deleteLabel, deleteTextBox, deleteImage]);

  async function saveNoteText() {
    if (!noteEditId) return;
    await updateNodeRemote(noteEditId, { texto: noteText });
    setNodes((nds) => nds.map((n) => n.id === noteEditId ? { ...n, data: { ...n.data, texto: noteText } } : n));
    setNoteDialogOpen(false);
    setNoteEditId(null);
  }

  const { data: openTask } = useQuery({
    queryKey: ["task", taskCardOpen],
    queryFn: async () => {
      if (!taskCardOpen) return null;
      const { data, error } = await supabase.from("tasks").select("*").eq("id", taskCardOpen).single();
      if (error) throw error;
      return data as Task;
    },
    enabled: !!taskCardOpen,
  });

  async function toggleTask(task: Task, solucao?: string) {
    const newStatus = task.status === "pendente" ? "concluida" : "pendente";
    await supabase.from("tasks").update({
      status: newStatus, solucao: solucao ?? task.solucao,
      concluida_em: newStatus === "concluida" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    qc.invalidateQueries({ queryKey: ["task", task.id] });
    qc.invalidateQueries({ queryKey: ["tasks-all"] });
  }

  async function deleteTask(task: Task) {
    if (!confirm("Excluir tarefa?")) return;
    await supabase.from("tasks").delete().eq("id", task.id);
    qc.invalidateQueries({ queryKey: ["tasks-all"] });
    setTaskCardOpen(null);
  }

  async function exportImage(kind: "png" | "svg") {
    const el = flowWrapper.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!el) return;
    const ns = getNodes();
    if (ns.length === 0) return toast.error("Nada para exportar");
    const bounds = getNodesBounds(ns);
    const width = Math.max(800, bounds.width + 200);
    const height = Math.max(600, bounds.height + 200);
    const vp = getViewportForBounds(bounds, width, height, 0.5, 2, 50);
    const fn = kind === "png" ? toPng : toSvg;
    try {
      const dataUrl = await fn(el, {
        backgroundColor: "#ffffff", width, height,
        style: {
          width: `${width}px`, height: `${height}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${flow?.nome || "fluxo"}.${kind}`;
      a.click();
    } catch (e) {
      toast.error("Erro ao exportar", { description: (e as Error).message });
    }
  }

  const [headerNome, setHeaderNome] = useState("");
  const [headerTipo, setHeaderTipo] = useState<"profissional" | "pessoal">("profissional");
  const [headerTemplate, setHeaderTemplate] = useState(false);
  const [headerDescricao, setHeaderDescricao] = useState("");
  const [descOpen, setDescOpen] = useState(false);
  useEffect(() => {
    if (!flow) return;
    setHeaderNome(flow.nome);
    setHeaderTipo(flow.tipo as "profissional" | "pessoal");
    setHeaderTemplate(!!flow.is_template);
    setHeaderDescricao(flow.descricao ?? "");
  }, [flow]);

  const saveFlowField = useCallback(
    async (patch: Partial<{ nome: string; tipo: string; is_template: boolean; descricao: string | null }>) => {
      setSaving(true);
      const { error } = await supabase.from("process_flows").update(patch).eq("id", flowId);
      setSaving(false);
      if (error) toast.error("Erro ao salvar", { description: error.message });
      else { setSavedAt(new Date()); qc.invalidateQueries({ queryKey: ["process_flows"] }); }
    },
    [flowId, qc],
  );

  function runValidation() {
    const real = nodes.filter((n) => (n.data as unknown as NodeData).tipo !== "comentario");
    const hasInicio = real.some((n) => (n.data as unknown as NodeData).etapa_tipo === "inicio");
    const hasFim = real.some((n) => (n.data as unknown as NodeData).etapa_tipo === "fim");
    const connected = new Set<string>();
    edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
    const isolated = real.filter((n) => !connected.has(n.id));
    const warnings: string[] = [];
    if (!hasInicio) warnings.push("Nenhum nó marcado como Início.");
    if (!hasFim) warnings.push("Nenhum nó marcado como Fim.");
    if (isolated.length > 0) warnings.push(`${isolated.length} nó(s) sem conexões.`);
    if (warnings.length === 0) {
      toast.success("OK: Fluxo possui pelo menos um nó de Início e um de Fim, sem nós isolados.");
    } else {
      toast.warning("Avisos de validação", { description: warnings.join(" ") });
    }
  }

  async function addLane() {
    const ordem = lanes.length;
    const { error } = await supabase.from("process_flow_lanes")
      .insert({ flow_id: flowId, nome: `Raia ${ordem + 1}`, tipo: "responsavel", ordem });
    if (error) toast.error("Erro", { description: error.message }); else refetchLanes();
  }
  async function renameLane(id: string, nome: string) {
    await supabase.from("process_flow_lanes").update({ nome }).eq("id", id); refetchLanes();
  }
  async function setLaneTipo(id: string, tipo: "responsavel" | "fase") {
    await supabase.from("process_flow_lanes").update({ tipo }).eq("id", id); refetchLanes();
  }
  async function moveLane(id: string, dir: -1 | 1) {
    const idx = lanes.findIndex((l) => l.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= lanes.length) return;
    await Promise.all([
      supabase.from("process_flow_lanes").update({ ordem: swap }).eq("id", lanes[idx].id),
      supabase.from("process_flow_lanes").update({ ordem: idx }).eq("id", lanes[swap].id),
    ]);
    refetchLanes();
  }
  async function removeLane(id: string) {
    if (!confirm("Excluir esta raia?")) return;
    await supabase.from("process_flow_lanes").delete().eq("id", id); refetchLanes();
  }

  // Largura dinâmica das raias: calculada a partir dos nós reais (não um
  // valor fixo gigante), senão o fitView zoom pra fora ao extremo só pra
  // caber uma faixa vazia enorme, encolhendo o conteúdo real a pontos
  // minúsculos e apagando visualmente a raia.
  const laneWidth = useMemo(() => {
    if (nodes.length === 0) return LANE_WIDTH_FALLBACK;
    const bounds = getNodesBounds(nodes);
    return Math.max(LANE_WIDTH_FALLBACK, bounds.x + bounds.width + 400);
  }, [nodes]);

  const allNodes = useMemo<Node[]>(() => {
    const laneNodes: Node[] = lanes.map((l, i) => ({
      id: `lane-${l.id}`,
      type: "lane",
      position: { x: -100, y: i * LANE_HEIGHT },
      data: { nome: l.nome, tipo: l.tipo, index: i, width: laneWidth },
      draggable: false, selectable: false,
      zIndex: -1,
    }));
    const labelNodes: Node[] = labels.map((l) => ({
      id: `label-${l.id}`,
      type: "label",
      position: { x: l.x, y: l.y },
      data: { text: l.text, color: l.color, onChange: updateLabel, onDelete: deleteLabel },
      zIndex: 10,
    }));
    const textboxNodes: Node[] = textboxes.map((t) => ({
      id: `textbox-${t.id}`,
      type: "textbox",
      position: { x: t.x, y: t.y },
      data: {
        text: t.text, color: t.color, fontFamily: t.fontFamily, fontSize: t.fontSize,
        orientation: t.orientation, w: t.w, h: t.h, onChange: updateTextBox, onDelete: deleteTextBox,
        autoEdit: t.id === justCreatedTextBoxId,
      },
      zIndex: 10,
    }));
    const imageNodes: Node[] = images.map((img) => ({
      id: `image-${img.id}`,
      type: "image",
      position: { x: img.x, y: img.y },
      data: { url: imageUrls[img.storagePath], w: img.w, h: img.h, onDelete: deleteImage, onResize: updateImage },
      zIndex: 10,
    }));
    return [...laneNodes, ...nodes, ...labelNodes, ...textboxNodes, ...imageNodes];
  }, [
    nodes, lanes, labels, laneWidth, updateLabel, deleteLabel,
    textboxes, updateTextBox, deleteTextBox, justCreatedTextBoxId,
    images, imageUrls, deleteImage, updateImage,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/processos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link>
          </Button>
          <Input className="text-lg font-bold h-9 max-w-xs"
            value={headerNome}
            onChange={(e) => setHeaderNome(e.target.value)}
            onBlur={() => { if (flow && headerNome !== flow.nome) saveFlowField({ nome: headerNome }); }} />
          <Select value={headerTipo}
            onValueChange={(v) => { setHeaderTipo(v as "profissional" | "pessoal"); saveFlowField({ tipo: v }); }}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="profissional">Profissional</SelectItem>
              <SelectItem value="pessoal">Pessoal</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 text-xs">
            <Switch checked={headerTemplate}
              onCheckedChange={(v) => { setHeaderTemplate(v); saveFlowField({ is_template: v }); }} />
            <span>Template</span>
          </div>
          <span className="text-xs text-muted-foreground ml-2">
            {saving ? "Salvando…" : savedAt ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR")}` : ""}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setDescOpen((v) => !v)}>Descrição</Button>
          <Button size="sm" variant="outline" onClick={() => setPickTaskOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Nó tarefa
          </Button>
          <Button size="sm" variant="outline" onClick={addNoteNode}>
            <Plus className="h-4 w-4 mr-1" />Nó nota
          </Button>
          <Button size="sm" variant="outline" onClick={addCommentNode}>
            <MessageSquare className="h-4 w-4 mr-1" />Nó comentário
          </Button>
          <Button size="sm" variant="outline" onClick={addFloatLabel}>
            <Tag className="h-4 w-4 mr-1" />Etiqueta
          </Button>
          <Button size="sm" variant="outline" onClick={undo} disabled={historyRef.current.length === 0} title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={futureRef.current.length === 0} title="Refazer (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={runValidation}>
            <CheckCircle2 className="h-4 w-4 mr-1" />Validar
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportImage("png")}>
            <FileImage className="h-4 w-4 mr-1" />PNG
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportImage("svg")}>
            <Download className="h-4 w-4 mr-1" />SVG
          </Button>
        </div>
      </div>

      {descOpen && (
        <Textarea rows={3} placeholder="Descrição do fluxo..." value={headerDescricao}
          onChange={(e) => setHeaderDescricao(e.target.value)}
          onBlur={() => saveFlowField({ descricao: headerDescricao || null })} />
      )}

      <div className="border rounded-md p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Swimlanes (raias)</div>
          <Button size="sm" variant="outline" onClick={addLane}>
            <Plus className="h-3 w-3 mr-1" />Adicionar raia
          </Button>
        </div>
        {lanes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma raia. Crie raias para agrupar os nós por responsável ou fase.
          </p>
        ) : (
          <div className="space-y-1">
            {lanes.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2 flex-wrap p-2 border rounded bg-card">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <Input className="h-8 max-w-xs" defaultValue={l.nome}
                  onBlur={(e) => { if (e.target.value !== l.nome) renameLane(l.id, e.target.value); }} />
                <Select value={l.tipo} onValueChange={(v) => setLaneTipo(l.id, v as "responsavel" | "fase")}>
                  <SelectTrigger className="w-36 h-8" title="Responsável = quem executa | Fase = etapa do processo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responsavel">Responsável</SelectItem>
                    <SelectItem value="fase">Fase</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveLane(l.id, -1)} disabled={i === 0}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveLane(l.id, 1)} disabled={i === lanes.length - 1}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLane(l.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Barra de ferramentas do canvas */}
      <div className="flex items-center gap-2 flex-wrap p-2 border rounded-md bg-card">
        <div className="flex items-center gap-1">
          <Button size="sm" variant={tool === "select" ? "default" : "outline"} onClick={() => setTool("select")} title="Selecionar / arrastar / deletar">
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "pencil" ? "default" : "outline"} onClick={() => setTool("pencil")} title="Desenho livre">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "rect" ? "default" : "outline"} onClick={() => setTool("rect")} title="Retângulo">
            <Square className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "ellipse" ? "default" : "outline"} onClick={() => setTool("ellipse")} title="Elipse">
            <Circle className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "line" ? "default" : "outline"} onClick={() => setTool("line")} title="Linha reta">
            <Minus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "arrow" ? "default" : "outline"} onClick={() => setTool("arrow")} title="Seta">
            <MoveUpRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "text" ? "default" : "outline"} onClick={() => setTool("text")} title="Caixa de texto — arraste no canvas pra posicionar e dimensionar">
            <Type className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")} title="Apagar traço/forma (um por vez)">
            <Eraser className="h-4 w-4" />
          </Button>
        </div>
        {tool === "text" && (
          <span className="text-xs text-muted-foreground">
            Arraste no canvas pra criar a caixa de texto (ou só clique pra usar o tamanho padrão).
          </span>
        )}
        {isDrawingTool && (
          <>
            <div className="flex items-center gap-1">
              {DRAW_COLORS.map((c) => (
                <button key={c} onClick={() => setDrawColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${drawColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                  style={{ background: c, borderColor: c }} title={c} />
              ))}
            </div>
            <Select value={drawWidth} onValueChange={(v) => setDrawWidth(v as DrawWidthKey)}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extrafina">Extrafina</SelectItem>
                <SelectItem value="fina">Fina</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="grossa">Grossa</SelectItem>
                <SelectItem value="extragrossa">Extragrossa</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-xs">
              <Label className="text-xs">Opacidade</Label>
              <input type="range" min={0.1} max={1} step={0.05} value={drawOpacity}
                onChange={(e) => setDrawOpacity(Number(e.target.value))} className="w-20" />
            </div>
            {(tool === "rect" || tool === "ellipse") && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">Preenchimento</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                  <div className="grid grid-cols-5 gap-1">
                    <button className="h-6 w-6 rounded border-2 border-dashed border-foreground/40 bg-white"
                      onClick={() => setFillColor(null)} title="Sem preenchimento" />
                    {DRAW_COLORS.map((c) => (
                      <button key={c} className={`h-6 w-6 rounded border-2 ${fillColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                        style={{ background: c, borderColor: c }} onClick={() => setFillColor(c)} title={c} />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button size="sm" variant="ghost" onClick={() => {
              if (!confirm("Apagar todos os traços e formas?")) return;
              pushHistory();
              setStrokes([]); setShapes([]);
              persistAll({ strokes: [], shapes: [] });
            }}>Limpar tudo</Button>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Dica: arraste a partir dos pontos azuis nas bordas dos nós para criar setas de fluxo. Ctrl+V cola uma imagem no canvas.
        </span>
      </div>

      <div ref={flowWrapper} className={`rf-wrapper rounded-lg relative overflow-hidden ${
          tool !== "select" ? "border-2 border-dashed border-amber-500" : "border"
        }`}
        style={{ height: "calc(100vh - 380px)", minHeight: 500, background: "#fafafa" }}>
        {tool !== "select" && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-amber-500 text-white text-xs font-semibold pl-3 pr-1.5 py-1.5 rounded-full shadow-lg">
            <Pencil className="h-3.5 w-3.5" />
            Modo desenho
            <Button size="sm" variant="secondary" className="h-6 px-2 text-amber-700" onClick={() => setTool("select")}>
              Sair
            </Button>
          </div>
        )}
        <ReactFlow
          nodes={allNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodesDelete={onNodesDelete}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          panOnDrag={!isBlockingTool}
          nodesDraggable={!isBlockingTool}
          nodesConnectable={!isBlockingTool}
          elementsSelectable={!isBlockingTool}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <DrawingOverlay
          tool={tool}
          color={drawColor}
          width={DRAW_WIDTHS[drawWidth]}
          opacity={drawOpacity}
          fill={fillColor}
          strokes={strokes}
          shapes={shapes}
          onStrokeEnd={handleStrokeEnd}
          onShapeEnd={handleShapeEnd}
          onEraseStroke={handleEraseStroke}
          onEraseShape={handleEraseShape}
          onTextBoxRect={createTextBoxAt}
          containerRef={flowWrapper}
        />
      </div>

      <Dialog open={pickTaskOpen} onOpenChange={setPickTaskOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular tarefa</DialogTitle>
            <DialogDescription>
              Escolha uma tarefa existente ou <Link to="/cadastro" className="underline text-primary">crie uma nova</Link>.
            </DialogDescription>
          </DialogHeader>
          <TaskPicker tasks={tasks} onPick={addTaskNode} />
        </DialogContent>
      </Dialog>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar texto</DialogTitle></DialogHeader>
          <Textarea rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveNoteText}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={edgeLabelDialogOpen} onOpenChange={setEdgeLabelDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rotular seta</DialogTitle></DialogHeader>
          <Input
            value={edgeLabelText}
            onChange={(e) => setEdgeLabelText(e.target.value)}
            placeholder="Ex.: Sim, Não, Aprovado..."
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveEdgeLabel(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdgeLabelDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdgeLabel}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!taskCardOpen} onOpenChange={(o) => !o && setTaskCardOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Tarefa vinculada</DialogTitle></DialogHeader>
          {openTask ? (
            <TaskCard task={openTask} onToggle={toggleTask} onDelete={deleteTask} />
          ) : (
            <p className="text-muted-foreground">Carregando...</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskPicker({ tasks, onPick }: { tasks: { id: string; titulo: string; status: string }[]; onPick: (t: { id: string; titulo: string }) => void }) {
  const [q, setQ] = useState("");
  const filtered = tasks.filter((t) => t.titulo.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <div className="space-y-2">
      <Input placeholder="Buscar tarefa..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="max-h-80 overflow-y-auto border rounded">
        {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma tarefa.</p>}
        {filtered.map((t) => (
          <button key={t.id}
            className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-0 text-sm"
            onClick={() => onPick(t)}>
            {t.titulo}
            <span className="text-xs text-muted-foreground ml-2">({t.status})</span>
          </button>
        ))}
      </div>
    </div>
  );
}