import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { TaskCard } from "@/components/TaskCard";
import { sortTasks, todayISO, type Task } from "@/lib/task-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico | Planejador" }] }),
  component: Historico,
});

function Historico() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "concluida" | "pendente">("todas");
  const [tipoFilter, setTipoFilter] = useState<"ambas" | "pessoal" | "profissional">("ambas");
  const [period, setPeriod] = useState<"7" | "30" | "all">("30");
  const [limit, setLimit] = useState(50);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("data", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const filtered = useMemo(() => {
    const today = todayISO();
    let arr = tasks.filter((t) => t.data < today || t.status === "concluida");
    if (statusFilter !== "todas") arr = arr.filter((t) => t.status === statusFilter);
    if (tipoFilter !== "ambas") arr = arr.filter((t) => t.tipo === tipoFilter);
    if (period !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(period));
      const cutoffISO = cutoff.toISOString().slice(0, 10);
      arr = arr.filter((t) => t.data >= cutoffISO);
    }
    const term = search.trim().toLowerCase();
    if (term) {
      arr = arr.filter((t) =>
        t.titulo.toLowerCase().includes(term) ||
        t.descricao?.toLowerCase().includes(term) ||
        t.nup?.toLowerCase().includes(term),
      );
    }
    return arr;
  }, [tasks, search, statusFilter, tipoFilter, period]);

  const visible = sortTasks(filtered).slice(0, limit);

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "pendente" ? "concluida" : "pendente";
      const { error } = await supabase.from("tasks").update({
        status: newStatus,
        concluida_em: newStatus === "concluida" ? new Date().toISOString() : null,
      }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const del = useMutation({
    mutationFn: async (task: Task) => {
      if (!confirm(`Excluir "${task.titulo}" do histórico?`)) throw new Error("cancelled");
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error("Erro", { description: e.message }); },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Histórico</h1>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por título, descrição ou NUP" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="pendente">Não concluídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ambas">Ambas</SelectItem>
            <SelectItem value="pessoal">Pessoais</SelectItem>
            <SelectItem value="profissional">Profissionais</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nenhuma tarefa no histórico.</Card>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={(task) => toggle.mutate(task)} onDelete={(task) => del.mutate(task)} />
          ))}
        </div>
      )}

      {filtered.length > visible.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + 50)}>Carregar mais</Button>
        </div>
      )}
    </div>
  );
}