import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Shortcut } from "@/lib/task-utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | Planejador" }] }),
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");

  const { data: shortcuts = [] } = useQuery({
    queryKey: ["shortcuts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shortcuts").select("*").order("ordem");
      if (error) throw error;
      return data as Shortcut[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!nome || !url) throw new Error("Preencha nome e URL");
      const { error } = await supabase.from("shortcuts").insert({
        user_id: ctx.user.id,
        nome, url, ordem: (shortcuts.at(-1)?.ordem ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome(""); setUrl("");
      qc.invalidateQueries({ queryKey: ["shortcuts"] });
      toast.success("Atalho adicionado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shortcuts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shortcuts"] }),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">Conta</h2>
        <p className="text-sm text-muted-foreground">E-mail: {ctx.user.email}</p>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-2">Atalhos corporativos</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Botões rápidos exibidos no cadastro de tarefas profissionais. Links com IP interno só funcionam dentro da rede do quartel.
        </p>
        <div className="space-y-2 mb-4">
          {shortcuts.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/40 border border-border">
              <div className="min-w-0">
                <div className="font-medium">{s.nome}</div>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary truncate block hover:underline">
                  <ExternalLink className="h-3 w-3 inline mr-1" />{s.url}
                </a>
              </div>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(s.id)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <div>
            <Label htmlFor="sn">Nome</Label>
            <Input id="sn" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: SPED" />
          </div>
          <div>
            <Label htmlFor="su">URL</Label>
            <Input id="su" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <Button onClick={() => add.mutate()}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-2">Google Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Integração disponível em breve. Cada usuário poderá conectar sua própria conta Google para sincronizar tarefas com prazo.
        </p>
      </Card>
    </div>
  );
}