import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Copy, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { createExampleFlow } from "@/lib/example-flow";
import { emptyFlowXml } from "@/features/processos/xmlMapping";
import { ensureDrawioXml } from "@/features/processos/migrateLegacyFlow";

export const Route = createFileRoute("/_authenticated/processos/")({
  component: ProcessosList,
});

type Flow = {
  id: string;
  nome: string;
  tipo: "profissional" | "pessoal";
  is_template: boolean;
  updated_at: string;
};

function ProcessosList() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const userId = ctx.user.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"todos" | "profissional" | "pessoal">("todos");
  const [tplFilter, setTplFilter] = useState<"todos" | "templates" | "reais">("todos");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newTipo, setNewTipo] = useState<"profissional" | "pessoal">("profissional");
  const [newTemplate, setNewTemplate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["process_flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .select("id,nome,tipo,is_template,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Flow[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flows.filter((f) => {
      if (filter !== "todos" && f.tipo !== filter) return false;
      if (tplFilter === "templates" && !f.is_template) return false;
      if (tplFilter === "reais" && f.is_template) return false;
      if (q && !f.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flows, filter, tplFilter, query]);

  const createFlow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("process_flows")
        .insert({
          user_id: userId,
          nome: newNome || "Novo fluxo",
          tipo: newTipo,
          is_template: newTemplate,
          drawio_xml: emptyFlowXml(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["process_flows"] });
      setCreateOpen(false);
      setNewNome("");
      setNewTemplate(false);
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

  const createExample = useMutation({
    mutationFn: () => createExampleFlow(userId),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["process_flows"] });
      toast.success("Fluxo de exemplo criado");
      navigate({ to: "/processos/$id", params: { id } });
    },
    onError: (e: Error) => toast.error("Erro ao criar exemplo", { description: e.message }),
  });

  const duplicateFlow = useMutation({
    mutationFn: async (flow: Flow) => {
      // drawio_xml é a fonte de verdade agora — duplicar é só copiar o
      // blob (migra o original primeiro se ainda for de um fluxo antigo,
      // pré-draw.io, que nunca foi aberto no editor novo). Bem mais
      // simples que o duplicate relacional antigo (raias/nós/arestas com
      // remapeamento de id) — não há mais "task_id stripped on copy"
      // porque não recriamos nós um a um: os nós tipo tarefa da cópia
      // continuam apontando pro mesmo task_id do original (mesma
      // limitação de antes, só que agora implícita no XML copiado).
      const { data: orig, error: oErr } = await supabase
        .from("process_flows")
        .select("nome,tipo,descricao")
        .eq("id", flow.id)
        .single();
      if (oErr) throw oErr;

      const xml = await ensureDrawioXml(flow.id);

      const { data: newFlow, error: fErr } = await supabase
        .from("process_flows")
        .insert({
          user_id: userId,
          nome: `Cópia de ${orig.nome}`,
          tipo: orig.tipo,
          descricao: orig.descricao,
          is_template: false,
          drawio_xml: xml,
        })
        .select("id")
        .single();
      if (fErr) throw fErr;
      return newFlow.id as string;
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
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar fluxo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="profissional">Profissional</SelectItem>
              <SelectItem value="pessoal">Pessoal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tplFilter} onValueChange={(v) => setTplFilter(v as typeof tplFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="templates">Apenas templates</SelectItem>
              <SelectItem value="reais">Apenas fluxos reais</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo fluxo
          </Button>
          <Button
            variant="outline"
            onClick={() => createExample.mutate()}
            disabled={createExample.isPending}
            title="Cria um fluxo modelo pronto com nós de exemplo"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Exemplo
          </Button>
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
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant={f.tipo === "profissional" ? "default" : "secondary"}>
                    {f.tipo === "profissional" ? "Profissional" : "Pessoal"}
                  </Badge>
                  {f.is_template && <Badge variant="outline">Template</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Atualizado em {new Date(f.updated_at).toLocaleDateString("pt-BR")}
                </p>
              </Link>
              <div className="flex gap-1 mt-3">
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/processos/$id" params={{ id: f.id }}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Editar
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => duplicateFlow.mutate(f)}>
                  <Copy className="h-3 w-3 mr-1" />
                  Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleteId(f.id)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Excluir
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
              <Input
                id="nome"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newTipo} onValueChange={(v) => setNewTipo(v as typeof newTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tpl" checked={newTemplate} onCheckedChange={setNewTemplate} />
              <Label htmlFor="tpl">Marcar como template</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createFlow.mutate()}>Criar e abrir editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              O fluxo e todos os seus nós, conexões e raias serão excluídos. Essa ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteFlow.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
