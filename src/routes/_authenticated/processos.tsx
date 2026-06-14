import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/processos")({
  component: ProcessosList,
});

type Flow = {
  id: string;
  nome: string;
  tipo: "profissional" | "pessoal";
  updated_at: string;
};

function ProcessosList() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const userId = ctx.user.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"todos" | "profissional" | "pessoal">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newTipo, setNewTipo] = useState<"profissional" | "pessoal">("profissional");

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["process_flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .select("id,nome,tipo,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Flow[];
    },
  });

  const filtered = filter === "todos" ? flows : flows.filter((f) => f.tipo === filter);

  const createFlow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .insert({ user_id: userId, nome: newNome || "Novo fluxo", tipo: newTipo })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["process_flows"] });
      setCreateOpen(false);
      setNewNome("");
      navigate({ to: "/processos/$id", params: { id } });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process_flows"] }),
  });

  const duplicateFlow = useMutation({
    mutationFn: async (flow: Flow) => {
      const { data: newFlow, error: fErr } = await supabase
        .from("process_flows")
        .insert({ user_id: userId, nome: `${flow.nome} (cópia)`, tipo: flow.tipo })
        .select("id")
        .single();
      if (fErr) throw fErr;
      const newFlowId = newFlow.id as string;

      const { data: nodes } = await supabase
        .from("process_flow_nodes")
        .select("*")
        .eq("flow_id", flow.id);
      const idMap = new Map<string, string>();
      if (nodes && nodes.length) {
        const inserts = nodes.map((n) => ({
          flow_id: newFlowId,
          tipo: n.tipo,
          task_id: null,
          texto: n.texto,
          posicao_x: n.posicao_x,
          posicao_y: n.posicao_y,
          cor: n.cor,
          red_flag: n.red_flag,
        }));
        const { data: inserted, error: nErr } = await supabase
          .from("process_flow_nodes")
          .insert(inserts)
          .select("id");
        if (nErr) throw nErr;
        inserted!.forEach((row, i) => idMap.set(nodes[i].id, row.id));
      }

      const { data: edges } = await supabase
        .from("process_flow_edges")
        .select("*")
        .eq("flow_id", flow.id);
      if (edges && edges.length) {
        const eInserts = edges
          .map((e) => ({
            flow_id: newFlowId,
            source_node_id: idMap.get(e.source_node_id)!,
            target_node_id: idMap.get(e.target_node_id)!,
          }))
          .filter((e) => e.source_node_id && e.target_node_id);
        if (eInserts.length) {
          const { error: eErr } = await supabase.from("process_flow_edges").insert(eInserts);
          if (eErr) throw eErr;
        }
      }
      return newFlowId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["process_flows"] });
      toast.success("Fluxo duplicado");
    },
    onError: (e: Error) => toast.error("Erro ao duplicar", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Fluxos de Processos</h1>
          <p className="text-sm text-muted-foreground">Documente rotinas visualmente.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="profissional">Profissional</SelectItem>
              <SelectItem value="pessoal">Pessoal</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Novo fluxo</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum fluxo ainda. Clique em "Novo fluxo" para começar.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <Card key={f.id} className="p-4 hover:border-primary transition-colors">
              <Link to="/processos/$id" params={{ id: f.id }} className="block">
                <h3 className="font-semibold truncate">{f.nome}</h3>
                <div className="flex gap-2 mt-2">
                  <Badge variant={f.tipo === "profissional" ? "default" : "secondary"}>
                    {f.tipo === "profissional" ? "Profissional" : "Pessoal"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Atualizado em {new Date(f.updated_at).toLocaleString("pt-BR")}
                </p>
              </Link>
              <div className="flex gap-1 mt-3">
                <Button size="sm" variant="ghost" onClick={() => duplicateFlow.mutate(f)}>
                  <Copy className="h-3 w-3 mr-1" />Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Excluir fluxo "${f.nome}"?`)) deleteFlow.mutate(f.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={newNome} onChange={(e) => setNewNome(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newTipo} onValueChange={(v) => setNewTipo(v as typeof newTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createFlow.mutate()}>Criar e abrir editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}