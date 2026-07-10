import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, FileImage, Plus } from "lucide-react";
import { toast } from "sonner";
import { TaskCard } from "@/components/TaskCard";
import type { Task } from "@/lib/task-utils";
import { DrawioEmbed, type DrawioEmbedApi } from "@/features/processos/DrawioEmbed";
import { ProcessoToolbar } from "@/features/processos/ProcessoToolbar";
import { useProcessoAutosave } from "@/features/processos/useProcessoAutosave";
import { ensureDrawioXml } from "@/features/processos/migrateLegacyFlow";
import { buildInsertNodePayload } from "@/features/processos/xmlMapping";
import type { SelectedCell } from "@/features/processos/drawioProtocol";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessFlowEditor,
});

// Self-hosted embed do repo fluxograma (draw.io) — ver deploy/embed/ lá.
// Precisa ser configurada por ambiente (dev aponta pro container local
// de teste, produção pro host publicado ao lado do app).
const FLUXOGRAMA_EMBED_URL = import.meta.env.VITE_FLUXOGRAMA_EMBED_URL ?? "http://localhost:8933";

function ProcessFlowEditor() {
  const { id: flowId } = Route.useParams();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const userId = ctx.user.id;
  const qc = useQueryClient();
  const { save, saving, savedAt } = useProcessoAutosave(flowId);

  const [drawioApi, setDrawioApi] = useState<DrawioEmbedApi | null>(null);
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([]);
  const [taskCardOpen, setTaskCardOpen] = useState<string | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskTitulo, setNewTaskTitulo] = useState("");

  const { data: flow, isLoading } = useQuery({
    queryKey: ["process_flow", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .select("id,nome,tipo")
        .eq("id", flowId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: initialXml } = useQuery({
    queryKey: ["process_flow_xml", flowId],
    queryFn: () => ensureDrawioXml(flowId),
    staleTime: Infinity, // só carrega uma vez — depois disso o iframe é quem manda no conteúdo
  });

  const { data: openTask } = useQuery({
    queryKey: ["task", taskCardOpen],
    enabled: !!taskCardOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskCardOpen!)
        .single();
      if (error) throw error;
      return data as Task;
    },
  });

  const toggleTask = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: task.status === "concluida" ? "pendente" : "concluida" })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskCardOpen] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setTaskCardOpen(null);
      toast.success("Tarefa excluída");
    },
  });

  const renameFlow = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("process_flows").update({ nome }).eq("id", flowId);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error("Erro ao renomear", { description: e.message }),
  });

  const createTask = useMutation({
    mutationFn: async (titulo: string) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ titulo, user_id: userId })
        .select("id,titulo")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (task) => {
      drawioApi?.insertNode(
        buildInsertNodePayload({
          id: crypto.randomUUID(),
          tipo: "tarefa",
          label: task.titulo,
          taskId: task.id,
          cor: "blue",
          etapaTipo: "intermediaria",
          x: 40,
          y: 40,
        }),
      );
      setAddTaskOpen(false);
      setNewTaskTitulo("");
    },
    onError: (e: Error) => toast.error("Erro ao criar tarefa", { description: e.message }),
  });

  const handleXmlChange = useCallback((xml: string) => save(xml), [save]);

  const handleTaskClick = useCallback((taskId: string) => {
    setTaskCardOpen(taskId);
  }, []);

  const handleUpdateCell = useCallback(
    (cellId: string, patch: { style?: string; attrs?: Record<string, string> }) => {
      drawioApi?.updateCell(cellId, patch);
    },
    [drawioApi],
  );

  function requestExport(format: "png" | "svg") {
    drawioApi?.requestExport(format);
  }

  function handleExport(format: string, data: string) {
    if (format !== "png" && format !== "svg") return;
    const a = document.createElement("a");
    a.href = data;
    a.download = `${flow?.nome ?? "fluxo"}.${format}`;
    a.click();
  }

  if (isLoading || !flow || initialXml == null) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 pb-3 flex-wrap">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/processos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          defaultValue={flow.nome}
          className="max-w-xs font-semibold"
          onBlur={(e) => e.target.value !== flow.nome && renameFlow.mutate(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {saving ? "Salvando…" : savedAt ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR")}` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddTaskOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Tarefa
          </Button>
          <Button size="sm" variant="outline" onClick={() => requestExport("png")}>
            <Download className="h-4 w-4 mr-1" />
            PNG
          </Button>
          <Button size="sm" variant="outline" onClick={() => requestExport("svg")}>
            <FileImage className="h-4 w-4 mr-1" />
            SVG
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 border rounded-md overflow-hidden">
          <DrawioEmbed
            embedUrl={FLUXOGRAMA_EMBED_URL}
            initialXml={initialXml}
            onXmlChange={handleXmlChange}
            onTaskClick={handleTaskClick}
            onSelectionChange={setSelectedCells}
            onExport={handleExport}
            onReady={setDrawioApi}
          />
        </div>
        <div className="w-64 shrink-0 overflow-y-auto">
          <ProcessoToolbar selectedCells={selectedCells} onUpdateCell={handleUpdateCell} />
        </div>
      </div>

      <Dialog open={!!taskCardOpen} onOpenChange={(o) => !o && setTaskCardOpen(null)}>
        <DialogContent>
          {openTask && (
            <TaskCard
              task={openTask}
              onToggle={(t) => toggleTask.mutate(t)}
              onDelete={(t) => deleteTask.mutate(t)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa no diagrama</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="novaTarefaTitulo">Título</Label>
            <Input
              id="novaTarefaTitulo"
              value={newTaskTitulo}
              onChange={(e) => setNewTaskTitulo(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!newTaskTitulo.trim() || createTask.isPending}
              onClick={() => createTask.mutate(newTaskTitulo.trim())}
            >
              Criar e adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
