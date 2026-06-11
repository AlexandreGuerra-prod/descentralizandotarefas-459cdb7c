import { useEffect, useState } from "react";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Paperclip, Clipboard, ExternalLink } from "lucide-react";
import { PRIORITY_LABEL, RECURRENCE_LABEL, todayISO, type Shortcut, type Task } from "@/lib/task-utils";
import { toast } from "sonner";

const MAX_FILE = 10 * 1024 * 1024;

export function TaskForm({ taskId }: { taskId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const user = ctx.user;

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(todayISO());
  const [prazo, setPrazo] = useState("");
  const [tipo, setTipo] = useState<"pessoal" | "profissional">("pessoal");
  const [origem, setOrigem] = useState("");
  const [nup, setNup] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [recorrencia, setRecorrencia] = useState("nenhuma");
  const [publicacao, setPublicacao] = useState(false);
  const [publicacaoNumero, setPublicacaoNumero] = useState("");
  const [publicacaoData, setPublicacaoData] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
      if (error) throw error;
      return data as Task;
    },
    enabled: !!taskId,
  });

  const { data: shortcuts = [] } = useQuery({
    queryKey: ["shortcuts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shortcuts").select("*").order("ordem");
      if (error) throw error;
      return data as Shortcut[];
    },
  });

  useEffect(() => {
    if (!existing) return;
    setTitulo(existing.titulo);
    setDescricao(existing.descricao ?? "");
    setData(existing.data);
    setPrazo(existing.prazo ? existing.prazo.slice(0, 16) : "");
    setTipo(existing.tipo);
    setOrigem(existing.origem ?? "");
    setNup(existing.nup ?? "");
    setResponsavel(existing.responsavel ?? "");
    setPrioridade(existing.prioridade);
    setRecorrencia(existing.recorrencia);
    setPublicacao(existing.publicacao);
    setPublicacaoNumero(existing.publicacao_numero ?? "");
    setPublicacaoData(existing.publicacao_data ?? "");
  }, [existing]);

  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          setPendingFiles((prev) => [...prev, file]);
          toast.success("Imagem anexada da área de transferência");
        }
      }
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      if (f.size > MAX_FILE) {
        toast.error(`${f.name} excede 10 MB`);
        return;
      }
    }
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user.id,
        titulo,
        descricao: descricao || null,
        data,
        prazo: prazo ? new Date(prazo).toISOString() : null,
        tipo,
        origem: tipo === "profissional" ? (origem || null) : null,
        nup: tipo === "profissional" ? (nup || null) : null,
        responsavel: tipo === "profissional" ? (responsavel || null) : null,
        prioridade: prioridade as Task["prioridade"],
        recorrencia: recorrencia as Task["recorrencia"],
        publicacao,
        publicacao_numero: publicacao ? (publicacaoNumero || null) : null,
        publicacao_data: publicacao ? (publicacaoData || null) : null,
      };

      let savedId = taskId;
      if (taskId) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("tasks").insert(payload).select("id").single();
        if (error) throw error;
        savedId = ins.id;
      }

      // Upload pending attachments
      for (const f of pendingFiles) {
        const path = `${user.id}/${savedId}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, f);
        if (upErr) throw upErr;
        await supabase.from("task_attachments").insert({
          task_id: savedId!,
          user_id: user.id,
          storage_path: path,
          file_name: f.name,
          mime_type: f.type,
          size_bytes: f.size,
        });
      }
    },
    onSuccess: () => {
      toast.success(taskId ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/principal" });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
    onSettled: () => setSaving(false),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    save.mutate();
  }

  return (
    <Card className="p-6 max-w-3xl" onPaste={handlePaste}>
      <h1 className="text-2xl font-bold mb-6">{taskId ? "Editar tarefa" : "Nova tarefa"}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="titulo">Título *</Label>
          <Input id="titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea id="descricao" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Cole texto ou imagem aqui (Ctrl+V)" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="data">Data</Label>
            <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="prazo">Prazo</Label>
            <Input id="prazo" type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pessoal">Pessoal</SelectItem>
                <SelectItem value="profissional">Profissional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={setPrioridade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recorrência</Label>
            <Select value={recorrencia} onValueChange={setRecorrencia}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {tipo === "profissional" && (
          <div className="space-y-4 p-4 rounded-lg bg-muted/40 border border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="origem">Origem</Label>
                <Input id="origem" placeholder="ex.: DIEX" value={origem} onChange={(e) => setOrigem(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="nup">NUP</Label>
                <Input id="nup" value={nup} onChange={(e) => setNup(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="resp">Responsável</Label>
                <Input id="resp" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="pub" checked={publicacao} onCheckedChange={setPublicacao} />
              <Label htmlFor="pub">Publicação em boletim interno</Label>
            </div>
            {publicacao && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pn">Número do boletim</Label>
                  <Input id="pn" value={publicacaoNumero} onChange={(e) => setPublicacaoNumero(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pd">Data do boletim</Label>
                  <Input id="pd" type="date" value={publicacaoData} onChange={(e) => setPublicacaoData(e.target.value)} />
                </div>
              </div>
            )}
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((s) => (
                  <Button key={s.id} type="button" variant="outline" size="sm" asChild>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />{s.nome}
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Anexos</Label>
          <div className="flex gap-2 flex-wrap items-center mt-1">
            <label>
              <input type="file" multiple className="hidden" onChange={onFiles} />
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Paperclip className="h-4 w-4 mr-1" />Selecionar arquivos</span>
              </Button>
            </label>
            <span className="text-xs text-muted-foreground"><Clipboard className="h-3 w-3 inline mr-1" />Cole imagens com Ctrl+V</span>
          </div>
          {pendingFiles.length > 0 && (
            <ul className="mt-2 text-sm space-y-1">
              {pendingFiles.map((f, i) => (
                <li key={i} className="flex justify-between items-center">
                  <span>{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}>
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/principal" })}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar tarefa
          </Button>
        </div>
      </form>
    </Card>
  );
}