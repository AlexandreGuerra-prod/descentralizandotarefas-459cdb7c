import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/TaskCard";
import type { Task } from "@/lib/task-utils";
import { toPng, toSvg } from "html-to-image";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessFlowEditor,
});

type FlowColor = "blue" | "coral" | "red" | "green" | "amber" | "purple" | "teal" | "pink" | "gray";
type EtapaTipo = "inicio" | "intermediaria" | "fim";
type TextColor = "black" | "slate" | "blue" | "red" | "green";
const ETAPA_LABEL: Record<EtapaTipo, string> = { inicio: "Início", intermediaria: "Intermediária", fim: "Fim" };

const LANE_HEIGHT = 240;
const LANE_WIDTH = 4000;

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

const DRAW_COLORS = ["#111827", "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"] as const;
const DRAW_WIDTHS = { fina: 2, media: 4, grossa: 8 } as const;
type DrawWidthKey = keyof typeof DRAW_WIDTHS;

type Stroke = { id: string; color: string; width: number; points: [number, number][] };
type FloatLabel = { id: string; x: number; y: number; text: string; color: string };
type CanvasExtras = { strokes?: Stroke[]; labels?: FloatLabel[] };

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
  onColorChange: (id: string, cor: FlowColor) => void;
  onTextColorChange: (id: string, c: TextColor) => void;
  onRedFlagToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onDurationChange: (id: string, minutes: number | null) => void;
  onEtapaChange: (id: string, etapa: EtapaTipo) => void;
  onCommentChange: (id: string, c: string) => void;
  onResize: (id: string, w: number, h: number) => void;
};

function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as NodeData;
  const isComment = d.tipo === "comentario";
  const etapaClass = isComment
    ? "border-dashed"
    : d.etapa_tipo === "inicio"
      ? "border-l-8 border-l-green-500"
      : d.etapa_tipo === "fim"
        ? "border-r-8 border-r-red-500 ring-1 ring-red-300"
        : "";
  const textColor = TEXT_COLOR[d.cor_texto ?? "black"];
  const bg = isComment ? "#ffffff" : COLOR_BG[d.cor];
  const border = isComment ? "#94a3b8" : COLOR_BORDER[d.cor];

  return (
    <div
      title={`${d.tipo === "tarefa" ? (d.taskTitulo ?? "Tarefa") : d.texto ?? ""}\nTipo: ${ETAPA_LABEL[d.etapa_tipo]}${d.duracao_estimada_minutes != null ? `\nDuração: ${d.duracao_estimada_minutes}min` : ""}`}
      className={`rounded-lg border-2 shadow-sm relative ${etapaClass} ${selected ? "ring-2 ring-blue-500 ring-offset-2 shadow-lg" : ""}`}
      style={{
        background: bg,
        borderColor: border,
        color: textColor,
        width: d.largura ?? 200,
        height: d.altura,
        minWidth: 160,
        minHeight: 90,
        resize: "both",
        overflow: "auto",
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
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      {d.red_flag && (
        <Flag className="absolute -top-2 -right-2 h-5 w-5 text-red-600 fill-red-600 drop-shadow" />
      )}
      <div className="px-3 py-2 cursor-pointer" onClick={() => d.onOpen(id)}>
        <div className="text-[10px] uppercase font-semibold opacity-60 flex items-center gap-1">
          {isComment ? <MessageSquare className="h-3 w-3" /> : d.tipo === "tarefa" ? <ListTodo className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
          {isComment ? "comentário" : `${d.tipo} · ${ETAPA_LABEL[d.etapa_tipo]}`}
          {!isComment && d.etapa_tipo === "inicio" && <Play className="h-3 w-3 text-green-600" />}
          {!isComment && d.etapa_tipo === "fim" && <Square className="h-3 w-3 text-red-600" />}
          {d.duracao_estimada_minutes != null && (
            <span className="ml-1 opacity-70">· {d.duracao_estimada_minutes}min</span>
          )}
        </div>
        <div className="text-sm font-medium whitespace-pre-wrap break-words">
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
      <div className="flex justify-end gap-1 px-1 pb-1 nodrag">
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
      {!isComment && (
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
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
    </div>
  );
}

function LaneNode({ data }: NodeProps) {
  const d = data as unknown as { nome: string; tipo: "responsavel" | "fase"; index: number };
  const isAlt = d.index % 2 === 1;
  return (
    <div
      style={{ width: LANE_WIDTH, height: LANE_HEIGHT }}
      className={`border-b-2 border-dashed border-foreground/20 ${isAlt ? "bg-slate-100/60" : "bg-slate-50/60"}`}
    >
      <div className="sticky left-0 inline-block px-3 py-1 m-2 text-xs font-semibold text-foreground bg-white/90 border border-slate-300 rounded shadow-sm">
        {d.nome} <span className="opacity-60 ml-1">· {d.tipo === "responsavel" ? "Responsável" : "Fase"}</span>
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

const nodeTypes = { flow: FlowNode, lane: LaneNode, label: LabelNode };

function ProcessFlowEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

/** Draw overlay synchronized with React Flow viewport transform. */
function DrawingOverlay({
  enabled,
  color,
  width,
  strokes,
  onStrokeEnd,
  onEraseStroke,
  eraseMode,
  containerRef,
}: {
  enabled: boolean;
  color: string;
  width: number;
  strokes: Stroke[];
  onStrokeEnd: (s: Stroke) => void;
  onEraseStroke: (id: string) => void;
  eraseMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const { x, y, zoom } = useViewport();
  const [current, setCurrent] = useState<Stroke | null>(null);

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
      const pt = flowPoint(e.clientX, e.clientY);
      setCurrent({ id: crypto.randomUUID(), color, width, points: [pt] });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      setCurrent((c) => c ? { ...c, points: [...c.points, flowPoint(e.clientX, e.clientY)] } : c);
    };
    const onUp = () => {
      setCurrent((c) => {
        if (c && c.points.length > 1) onStrokeEnd(c);
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
  }, [enabled, eraseMode, color, width, flowPoint, onStrokeEnd, containerRef]);

  const toPath = (pts: [number, number][]) =>
    pts.length === 0 ? "" : `M ${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(" ");

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: enabled ? "auto" : "none", zIndex: 5, cursor: enabled ? (eraseMode ? "crosshair" : "crosshair") : "default" }}
    >
      <g transform={`translate(${x} ${y}) scale(${zoom})`}>
        {strokes.map((s) => (
          <path
            key={s.id}
            d={toPath(s.points)}
            stroke={s.color}
            strokeWidth={s.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: eraseMode ? "stroke" : "none", cursor: eraseMode ? "pointer" : "default" }}
            onClick={() => eraseMode && onEraseStroke(s.id)}
          />
        ))}
        {current && (
          <path
            d={toPath(current.points)}
            stroke={current.color}
            strokeWidth={current.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  );
}

function EditorInner() {
  const { id: flowId } = Route.useParams();
  const qc = useQueryClient();
  const { getNodes, screenToFlowPosition } = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);

  const [pickTaskOpen, setPickTaskOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [taskCardOpen, setTaskCardOpen] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  // Drawing & labels (persisted in process_flows.canvas_extras)
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [labels, setLabels] = useState<FloatLabel[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState<DrawWidthKey>("media");

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

  const persistStrokes = useCallback((s: Stroke[]) => saveExtras({ strokes: s, labels }), [saveExtras, labels]);
  const persistLabels = useCallback((l: FloatLabel[]) => saveExtras({ strokes, labels: l }), [saveExtras, strokes]);

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

  const handleEtapaChange = useCallback((id: string, etapa: EtapaTipo) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, etapa_tipo: etapa } } : n));
    updateNodeRemote(id, { etapa_tipo: etapa });
  }, [setNodes, updateNodeRemote]);

  const commentTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleCommentChange = useCallback((id: string, comentario: string) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, comentario } } : n));
    if (commentTimer.current[id]) clearTimeout(commentTimer.current[id]);
    commentTimer.current[id] = setTimeout(() => updateNodeRemote(id, { comentario: comentario || null }), 500);
  }, [setNodes, updateNodeRemote]);

  const handleDeleteNode = useCallback(async (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    await supabase.from("process_flow_nodes").delete().eq("id", id);
  }, [setNodes, setEdges]);

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
      onColorChange: handleColorChange,
      onTextColorChange: handleTextColorChange,
      onRedFlagToggle: handleRedFlagToggle,
      onDelete: handleDeleteNode,
      onOpen: handleOpenNode,
      onDurationChange: handleDurationChange,
      onEtapaChange: handleEtapaChange,
      onCommentChange: handleCommentChange,
    } as NodeData as unknown as Record<string, unknown>,
  }), [taskMap, handleColorChange, handleTextColorChange, handleRedFlagToggle, handleDeleteNode, handleOpenNode, handleDurationChange, handleEtapaChange, handleCommentChange]);

  useEffect(() => {
    if (loaded) return;
    (async () => {
      const [{ data: nRows }, { data: eRows }] = await Promise.all([
        supabase.from("process_flow_nodes").select("*").eq("flow_id", flowId),
        supabase.from("process_flow_edges").select("*").eq("flow_id", flowId),
      ]);
      setNodes((nRows ?? []).map(decorateNode));
      setEdges((eRows ?? []).map((e) => ({
        id: e.id, source: e.source_node_id, target: e.target_node_id,
        animated: false, style: { strokeWidth: 2 },
      })));
      setLoaded(true);
    })();
  }, [flowId, loaded, decorateNode, setNodes, setEdges]);

  useEffect(() => {
    if (!flow) return;
    const extras = (flow.canvas_extras as CanvasExtras | null) ?? {};
    setStrokes(extras.strokes ?? []);
    setLabels(extras.labels ?? []);
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
    setEdges((eds) => addEdge({ ...params, id: data.id, animated: true, style: { strokeWidth: 2 } }, eds));
    setTimeout(() => setEdges((eds) => eds.map((e) => e.id === data.id ? { ...e, animated: false } : e)), 600);
  }, [flowId, setEdges]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) await supabase.from("process_flow_edges").delete().eq("id", e.id);
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "lane") return;
    if (node.type === "label") {
      const labelId = node.id.replace(/^label-/, "");
      setLabels((ls) => {
        const next = ls.map((l) => l.id === labelId ? { ...l, x: node.position.x, y: node.position.y } : l);
        persistLabels(next);
        return next;
      });
      return;
    }
    let lane_id: string | null = null;
    if (lanes.length > 0) {
      const idx = Math.max(0, Math.min(lanes.length - 1, Math.floor(node.position.y / LANE_HEIGHT)));
      lane_id = lanes[idx]?.id ?? null;
    }
    updateNodeRemote(node.id, {
      posicao_x: node.position.x, posicao_y: node.position.y, lane_id,
    });
  }, [updateNodeRemote, lanes, persistLabels]);

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

  function addFloatLabel() {
    const wrap = flowWrapper.current?.getBoundingClientRect();
    const p = wrap
      ? screenToFlowPosition({ x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2 })
      : { x: 200, y: 200 };
    const next: FloatLabel = { id: crypto.randomUUID(), x: p.x, y: p.y, text: "Etiqueta", color: "#b45309" };
    const arr = [...labels, next];
    setLabels(arr);
    persistLabels(arr);
  }

  const updateLabel = useCallback((id: string, patch: Partial<FloatLabel>) => {
    setLabels((ls) => {
      const next = ls.map((l) => l.id === id ? { ...l, ...patch } : l);
      persistLabels(next);
      return next;
    });
  }, [persistLabels]);

  const deleteLabel = useCallback((id: string) => {
    setLabels((ls) => {
      const next = ls.filter((l) => l.id !== id);
      persistLabels(next);
      return next;
    });
  }, [persistLabels]);

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

  const allNodes = useMemo<Node[]>(() => {
    const laneNodes: Node[] = lanes.map((l, i) => ({
      id: `lane-${l.id}`,
      type: "lane",
      position: { x: -100, y: i * LANE_HEIGHT },
      data: { nome: l.nome, tipo: l.tipo, index: i },
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
    return [...laneNodes, ...nodes, ...labelNodes];
  }, [nodes, lanes, labels, updateLabel, deleteLabel]);

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

      {/* Pencil toolbar */}
      <div className="flex items-center gap-2 flex-wrap p-2 border rounded-md bg-card">
        <Button
          size="sm"
          variant={drawMode ? "default" : "outline"}
          onClick={() => { setDrawMode((v) => !v); setEraseMode(false); }}
          title="Desenho livre"
        >
          <Pencil className="h-4 w-4 mr-1" />{drawMode ? "Desenhando" : "Desenhar"}
        </Button>
        {drawMode && (
          <>
            <div className="flex items-center gap-1">
              {DRAW_COLORS.map((c) => (
                <button key={c} onClick={() => setDrawColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${drawColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                  style={{ background: c, borderColor: c }} title={c} />
              ))}
            </div>
            <Select value={drawWidth} onValueChange={(v) => setDrawWidth(v as DrawWidthKey)}>
              <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fina">Fina</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="grossa">Grossa</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant={eraseMode ? "default" : "outline"} onClick={() => setEraseMode((v) => !v)}>
              <Eraser className="h-4 w-4 mr-1" />{eraseMode ? "Apagando" : "Apagar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              if (!confirm("Apagar todos os desenhos?")) return;
              setStrokes([]); persistStrokes([]);
            }}>Limpar tudo</Button>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Dica: arraste a partir dos pontos azuis nas bordas dos nós para criar setas.
        </span>
      </div>

      <div ref={flowWrapper} className="border rounded-lg relative overflow-hidden"
        style={{ height: "calc(100vh - 380px)", minHeight: 500, background: "#fafafa" }}>
        <ReactFlow
          nodes={allNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          panOnDrag={!drawMode}
          nodesDraggable={!drawMode}
          nodesConnectable={!drawMode}
          elementsSelectable={!drawMode}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <DrawingOverlay
          enabled={drawMode}
          color={drawColor}
          width={DRAW_WIDTHS[drawWidth]}
          strokes={strokes}
          eraseMode={eraseMode}
          onStrokeEnd={(s) => {
            const next = [...strokes, s];
            setStrokes(next);
            persistStrokes(next);
          }}
          onEraseStroke={(id) => {
            const next = strokes.filter((s) => s.id !== id);
            setStrokes(next);
            persistStrokes(next);
          }}
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