import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Download, FileImage, Flag, Plus, StickyNote, ListTodo, Trash2, Palette } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/TaskCard";
import type { Task } from "@/lib/task-utils";
import { toPng, toSvg } from "html-to-image";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessFlowEditor,
});

type FlowColor = "blue" | "coral" | "red" | "green" | "amber" | "purple" | "teal" | "pink" | "gray";

const COLOR_BG: Record<FlowColor, string> = {
  blue: "#dbeafe",
  coral: "#ffd6cc",
  red: "#fecaca",
  green: "#d1fae5",
  amber: "#fde68a",
  purple: "#e9d5ff",
  teal: "#ccfbf1",
  pink: "#fbcfe8",
  gray: "#e5e7eb",
};
const COLOR_BORDER: Record<FlowColor, string> = {
  blue: "#3b82f6",
  coral: "#fb7185",
  red: "#ef4444",
  green: "#10b981",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
  gray: "#6b7280",
};
const COLORS = Object.keys(COLOR_BG) as FlowColor[];

type NodeData = {
  tipo: "tarefa" | "nota";
  texto: string | null;
  task_id: string | null;
  taskTitulo?: string | null;
  cor: FlowColor;
  red_flag: boolean;
  onColorChange: (id: string, cor: FlowColor) => void;
  onRedFlagToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
};

function FlowNode({ id, data }: NodeProps) {
  const d = data as unknown as NodeData;
  return (
    <div
      className="rounded-lg border-2 shadow-sm min-w-[180px] max-w-[260px] relative"
      style={{ background: COLOR_BG[d.cor], borderColor: COLOR_BORDER[d.cor] }}
    >
      <Handle type="target" position={Position.Top} />
      {d.red_flag && (
        <Flag className="absolute -top-2 -right-2 h-5 w-5 text-red-600 fill-red-600 drop-shadow" />
      )}
      <div className="px-3 py-2 cursor-pointer text-foreground" onClick={() => d.onOpen(id)}>
        <div className="text-[10px] uppercase font-semibold opacity-60 flex items-center gap-1">
          {d.tipo === "tarefa" ? <ListTodo className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
          {d.tipo}
        </div>
        <div className="text-sm font-medium whitespace-pre-wrap break-words">
          {d.tipo === "tarefa"
            ? d.taskTitulo ?? (d.task_id ? "(tarefa)" : "Sem tarefa vinculada")
            : d.texto || "(nota vazia)"}
        </div>
      </div>
      <div className="flex justify-end gap-1 px-1 pb-1 nodrag">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6"><Palette className="h-3 w-3" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-5 gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded border-2"
                  style={{ background: COLOR_BG[c], borderColor: COLOR_BORDER[c] }}
                  onClick={() => d.onColorChange(id, c)}
                  title={c}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => d.onRedFlagToggle(id)}
          title="Red flag"
        >
          <Flag className={`h-3 w-3 ${d.red_flag ? "text-red-600 fill-red-600" : ""}`} />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => d.onDelete(id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

function ProcessFlowEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

function EditorInner() {
  const { id: flowId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { getNodes } = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);

  const [pickTaskOpen, setPickTaskOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [taskCardOpen, setTaskCardOpen] = useState<string | null>(null);

  // Load flow
  const { data: flow } = useQuery({
    queryKey: ["process_flow", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .select("*")
        .eq("id", flowId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,titulo,status")
        .order("created_at", { ascending: false })
        .limit(500);
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
    async (id: string, patch: Partial<{ cor: FlowColor; red_flag: boolean; texto: string; posicao_x: number; posicao_y: number }>) => {
      const { error } = await supabase.from("process_flow_nodes").update(patch).eq("id", id);
      if (error) toast.error("Erro ao salvar", { description: error.message });
    },
    [],
  );

  const handleColorChange = useCallback((id: string, cor: FlowColor) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, cor } } : n)));
    updateNodeRemote(id, { cor });
  }, [setNodes, updateNodeRemote]);

  const handleRedFlagToggle = useCallback((id: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== id) return n;
      const newVal = !(n.data as unknown as NodeData).red_flag;
      updateNodeRemote(id, { red_flag: newVal });
      return { ...n, data: { ...n.data, red_flag: newVal } };
    }));
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
      } else if (d.tipo === "nota") {
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
      red_flag: row.red_flag,
      onColorChange: handleColorChange,
      onRedFlagToggle: handleRedFlagToggle,
      onDelete: handleDeleteNode,
      onOpen: handleOpenNode,
    } as NodeData as unknown as Record<string, unknown>,
  }), [taskMap, handleColorChange, handleRedFlagToggle, handleDeleteNode, handleOpenNode]);

  // Initial load
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
      })));
      setLoaded(true);
    })();
  }, [flowId, loaded, decorateNode, setNodes, setEdges]);

  // Refresh task titles when tasks list changes
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
      .select("id")
      .single();
    if (error) {
      toast.error("Erro ao conectar", { description: error.message });
      return;
    }
    setEdges((eds) => addEdge({ ...params, id: data.id }, eds));
  }, [flowId, setEdges]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      await supabase.from("process_flow_edges").delete().eq("id", e.id);
    }
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    updateNodeRemote(node.id, { posicao_x: node.position.x, posicao_y: node.position.y });
  }, [updateNodeRemote]);

  async function addNoteNode() {
    const center = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
    const { data, error } = await supabase
      .from("process_flow_nodes")
      .insert({
        flow_id: flowId,
        tipo: "nota",
        texto: "Nova nota",
        posicao_x: center.x,
        posicao_y: center.y,
        cor: "amber",
      })
      .select("*")
      .single();
    if (error) return toast.error("Erro", { description: error.message });
    setNodes((nds) => [...nds, decorateNode(data)]);
  }

  async function addTaskNode(task: { id: string; titulo: string }) {
    const center = { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 };
    const { data, error } = await supabase
      .from("process_flow_nodes")
      .insert({
        flow_id: flowId,
        tipo: "tarefa",
        task_id: task.id,
        posicao_x: center.x,
        posicao_y: center.y,
        cor: "blue",
      })
      .select("*")
      .single();
    if (error) return toast.error("Erro", { description: error.message });
    setNodes((nds) => [...nds, decorateNode(data)]);
    setPickTaskOpen(false);
  }

  async function saveNoteText() {
    if (!noteEditId) return;
    await updateNodeRemote(noteEditId, { texto: noteText });
    setNodes((nds) => nds.map((n) => n.id === noteEditId ? { ...n, data: { ...n.data, texto: noteText } } : n));
    setNoteDialogOpen(false);
    setNoteEditId(null);
  }

  // Task card data
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
      status: newStatus,
      solucao: solucao ?? task.solucao,
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
    const container = flowWrapper.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!el || !container) return;
    const ns = getNodes();
    if (ns.length === 0) return toast.error("Nada para exportar");
    const bounds = getNodesBounds(ns);
    const width = Math.max(800, bounds.width + 200);
    const height = Math.max(600, bounds.height + 200);
    const vp = getViewportForBounds(bounds, width, height, 0.5, 2, 50);
    const fn = kind === "png" ? toPng : toSvg;
    try {
      const dataUrl = await fn(el, {
        backgroundColor: "#ffffff",
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
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

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState("");
  useEffect(() => { if (flow) setRenameText(flow.nome); }, [flow]);

  async function saveRename() {
    await supabase.from("process_flows").update({ nome: renameText }).eq("id", flowId);
    qc.invalidateQueries({ queryKey: ["process_flow", flowId] });
    qc.invalidateQueries({ queryKey: ["process_flows"] });
    setRenameOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/processos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link>
          </Button>
          <button className="text-xl font-bold hover:underline" onClick={() => setRenameOpen(true)}>
            {flow?.nome ?? "Fluxo"}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setPickTaskOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Nó tarefa
          </Button>
          <Button size="sm" variant="outline" onClick={addNoteNode}>
            <Plus className="h-4 w-4 mr-1" />Nó nota
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportImage("png")}>
            <FileImage className="h-4 w-4 mr-1" />PNG
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportImage("svg")}>
            <Download className="h-4 w-4 mr-1" />SVG
          </Button>
        </div>
      </div>

      <div ref={flowWrapper} className="border rounded-lg" style={{ height: "calc(100vh - 220px)", minHeight: 500, background: "#fafafa" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {/* Pick task dialog */}
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

      {/* Note edit dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar nota</DialogTitle></DialogHeader>
          <Textarea rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveNoteText}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task card dialog */}
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

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear fluxo</DialogTitle></DialogHeader>
          <div>
            <Label htmlFor="rn">Nome</Label>
            <Input id="rn" value={renameText} onChange={(e) => setRenameText(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={saveRename}>Salvar</Button>
          </DialogFooter>
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
          <button
            key={t.id}
            className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-0 text-sm"
            onClick={() => onPick(t)}
          >
            {t.titulo}
            <span className="text-xs text-muted-foreground ml-2">({t.status})</span>
          </button>
        ))}
      </div>
    </div>
  );
}