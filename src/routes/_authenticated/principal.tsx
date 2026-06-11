import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Search, Download, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { TaskCard } from "@/components/TaskCard";
import { addToDateISO, sortTasks, todayISO, type Task } from "@/lib/task-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/principal")({
  head: () => ({ meta: [{ title: "Hoje | Planejador" }] }),
  component: Principal,
});

function Principal() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNext7, setShowNext7] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("status", "pendente")
        .order("data", { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
  });

  const today = todayISO();
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const next7ISO = next7.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter(
      (t) =>
        t.titulo.toLowerCase().includes(term) ||
        t.descricao?.toLowerCase().includes(term) ||
        t.nup?.toLowerCase().includes(term),
    );
  }, [tasks, search]);

  const todayTasks = sortTasks(filtered.filter((t) => t.data <= today));
  const upcoming = sortTasks(filtered.filter((t) => t.data > today && t.data <= next7ISO));

  const toggleMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "pendente" ? "concluida" : "pendente";
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus, concluida_em: newStatus === "concluida" ? new Date().toISOString() : null })
        .eq("id", task.id);
      if (error) throw error;
      // Auto-create next occurrence for recurring tasks when marking as complete
      if (newStatus === "concluida" && task.recorrencia !== "nenhuma") {
        const nextData = addToDateISO(task.data, task.recorrencia);
        const { error: e2 } = await supabase.from("tasks").insert({
          user_id: task.user_id,
          titulo: task.titulo,
          descricao: task.descricao,
          data: nextData,
          prazo: task.prazo ? new Date(addToDateISO(task.data, task.recorrencia) + "T" + new Date(task.prazo).toISOString().slice(11, 19)).toISOString() : null,
          tipo: task.tipo,
          origem: task.origem,
          nup: task.nup,
          responsavel: task.responsavel,
          prioridade: task.prioridade,
          recorrencia: task.recorrencia,
          parent_task_id: task.id,
        });
        if (e2) throw e2;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (task: Task) => {
      if (!confirm(`Excluir "${task.titulo}"?`)) throw new Error("cancelled");
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída");
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => {
      if (e.message !== "cancelled") toast.error("Erro", { description: e.message });
    },
  });

  async function handleBackup() {
    const { data, error } = await supabase.from("tasks").select("*");
    if (error) { toast.error("Erro no backup", { description: error.message }); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planejador-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup gerado");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("Arquivo inválido");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const rows = arr.map((t) => ({
        user_id: user.id,
        titulo: t.titulo,
        descricao: t.descricao,
        data: t.data,
        prazo: t.prazo,
        tipo: t.tipo,
        origem: t.origem,
        nup: t.nup,
        responsavel: t.responsavel,
        prioridade: t.prioridade,
        recorrencia: t.recorrencia,
        status: t.status,
        solucao: t.solucao,
      }));
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} tarefas importadas`);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      toast.error("Falha ao importar", { description: (err as Error).message });
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tarefas de hoje</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleBackup}><Download className="h-4 w-4 mr-1" />Backup</Button>
          <label>
            <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" />Importar</span></Button>
          </label>
          <Button asChild>
            <Link to="/cadastro"><Plus className="h-4 w-4 mr-1" />Nova tarefa</Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por título, descrição ou NUP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : todayTasks.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhuma tarefa pendente para hoje. Aproveite!
        </Card>
      ) : (
        <div className="space-y-3">
          {todayTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onToggle={(task) => toggleMutation.mutate(task)}
              onDelete={(task) => deleteMutation.mutate(task)}
              onCopy={() => toast.success("Copiado")}
            />
          ))}
        </div>
      )}

      <Collapsible open={showNext7} onOpenChange={setShowNext7}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span>Próximos 7 dias ({upcoming.length})</span>
            {showNext7 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem tarefas agendadas.</p>
          ) : (
            upcoming.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onToggle={(task) => toggleMutation.mutate(task)}
                onDelete={(task) => deleteMutation.mutate(task)}
              />
            ))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}