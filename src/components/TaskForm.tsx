import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Paperclip, Clipboard, ExternalLink, Eye, Info, Trash2, StickyNote, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { PRIORITY_LABEL, RECURRENCE_LABEL, todayISO, type Shortcut, type Task } from "@/lib/task-utils";
import { toast } from "sonner";
import { MicButton } from "@/components/MicButton";

const MAX_FILE = 10 * 1024 * 1024;

type AttachmentPreview = { url: string; name: string; mime: string };

function sanitizeFileName(name: string): string {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-120) || "arquivo";
}

function extFromMime(mime: string): string {
  if (!mime) return "bin";
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}

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
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; titulo: string } | null>(null);
  const [blockedFiles, setBlockedFiles] = useState<{ name: string; size: number }[]>([]);

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

  const { data: attachments = [] } = useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });

  const { data: linkedNotes = [] } = useQuery({
    queryKey: ["task-notes", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, updated_at")
        .eq("task_id", taskId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });

  async function viewAttachment(att: { storage_path: string; file_name: string; mime_type: string | null }) {
    const { data, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(att.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o anexo", { description: error?.message });
      return;
    }
    setPreview({ url: data.signedUrl, name: att.file_name, mime: att.mime_type ?? "" });
  }

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota excluída");
      qc.invalidateQueries({ queryKey: ["task-notes", taskId] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      setNoteToDelete(null);
    },
    onError: (e: Error) => toast.error("Erro ao excluir nota", { description: e.message }),
  });

  // Trava "só carrega uma vez por tarefa": sem isso, qualquer refetch em
  // segundo plano de `existing` (React Query com staleTime:0 +
  // refetchOnWindowFocus:true por padrão, ver router.tsx) reaplicava os
  // dados antigos do banco por cima de uma edição em andamento — trocar de
  // aba no meio da digitação apagava o que o usuário tinha acabado de
  // escrever, sem aviso nenhum. Guarda por `taskId` (não só uma vez pra
  // sempre) porque este componente pode ser reaproveitado ao navegar direto
  // de uma tarefa pra outra sem remontar.
  const syncedTaskIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!existing || syncedTaskIdRef.current === taskId) return;
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
    syncedTaskIdRef.current = taskId;
  }, [existing, taskId]);

  function partitionBySize(files: File[]): { accepted: File[]; blocked: { name: string; size: number }[] } {
    const accepted: File[] = [];
    const blocked: { name: string; size: number }[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE) blocked.push({ name: f.name || "imagem colada", size: f.size });
      else accepted.push(f);
    }
    return { accepted, blocked };
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          // Renomeia colagens (todas viriam como "image.png") pra evitar colisão no storage.
          const ext = extFromMime(file.type);
          const renamed = new File([file], `colagem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, { type: file.type });
          pasted.push(renamed);
        }
      }
    }
    if (pasted.length === 0) return;
    const { accepted, blocked } = partitionBySize(pasted);
    if (accepted.length > 0) {
      setPendingFiles((prev) => [...prev, ...accepted]);
      toast.success(`${accepted.length} imagem(ns) anexada(s) da área de transferência`);
    }
    if (blocked.length > 0) setBlockedFiles(blocked);
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const { accepted, blocked } = partitionBySize(files);
    if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted]);
    if (blocked.length > 0) setBlockedFiles(blocked);
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

      // Upload pending attachments — sufixo aleatório + nome higienizado
      // evita colisão quando o usuário anexa vários arquivos no mesmo ms
      // ou quando dois arquivos têm o mesmo nome (ex.: várias colagens).
      for (const f of pendingFiles) {
        const safeName = sanitizeFileName(f.name);
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
        const path = `${user.id}/${savedId}/${unique}`;
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
          <div className="flex gap-2">
            <Input id="titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <MicButton onResult={(t) => setTitulo((prev) => (prev ? prev + " " : "") + t)} />
          </div>
        </div>
        <div>
          <Label htmlFor="descricao">Descrição</Label>
          <div className="flex gap-2 items-start">
            <Textarea id="descricao" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Cole texto ou imagem aqui (Ctrl+V) ou use o microfone" />
            <MicButton onResult={(t) => setDescricao((prev) => (prev ? prev + " " : "") + t)} />
          </div>
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
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Info className="h-3 w-3" /> Tamanho máximo por arquivo: 10 MB.
          </p>
          <div className="flex gap-2 flex-wrap items-center mt-1">
            <label>
              <input type="file" multiple className="hidden" onChange={onFiles} />
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Paperclip className="h-4 w-4 mr-1" />Selecionar arquivos</span>
              </Button>
            </label>
            <span className="text-xs text-muted-foreground"><Clipboard className="h-3 w-3 inline mr-1" />Cole imagens com Ctrl+V</span>
          </div>
          {attachments.length > 0 && (
            <ul className="mt-3 text-sm space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex justify-between items-center gap-2">
                  <span className="truncate">
                    {a.file_name}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({((a.size_bytes ?? 0) / 1024).toFixed(0)} KB)
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => viewAttachment(a)}
                    title="Visualizar anexo"
                  >
                    <Eye className="h-4 w-4 mr-1" /> Visualizar
                  </Button>
                </li>
              ))}
            </ul>
          )}
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

        {taskId && (
          <div>
            <Label className="flex items-center gap-1"><StickyNote className="h-4 w-4" /> Notas vinculadas</Label>
            {linkedNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhuma nota vinculada.{" "}
                <Link
                  to="/anotacoes"
                  search={{ taskId, titulo, numero: existing?.numero ?? undefined }}
                  className="underline text-primary"
                >
                  Criar nota
                </Link>
              </p>
            ) : (
              <ul className="mt-2 text-sm space-y-1">
                {linkedNotes.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
                    <Link
                      to="/anotacoes"
                      search={{ taskId, titulo, numero: existing?.numero ?? undefined }}
                      className="truncate hover:underline"
                      title={n.title}
                    >
                      {n.title || "(sem título)"}
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(n.updated_at).toLocaleDateString("pt-BR")}
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNoteToDelete({ id: n.id, titulo: n.title })}
                      className="text-destructive"
                      title="Excluir nota"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/principal" })}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar tarefa
          </Button>
        </div>
      </form>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="w-full">
              {preview.mime.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-[75vh] w-auto mx-auto rounded"
                />
              ) : preview.mime === "application/pdf" || preview.mime.startsWith("text/") ? (
                <iframe
                  src={preview.url}
                  title={preview.name}
                  className="w-full h-[75vh] rounded border border-border"
                />
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Pré-visualização não disponível para este formato ({preview.mime || "desconhecido"}).
                  Use os botões abaixo para abrir ou baixar o arquivo.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {preview && (
              <>
                <Button variant="outline" asChild>
                  <a href={preview.url} download={preview.name}>
                    <Download className="h-4 w-4 mr-1" /> Baixar
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={preview.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Abrir em nova aba
                  </a>
                </Button>
              </>
            )}
            <Button onClick={() => setPreview(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir a nota "{noteToDelete?.titulo || "(sem título)"}"? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => noteToDelete && deleteNote.mutate(noteToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockedFiles.length > 0} onOpenChange={(open) => !open && setBlockedFiles([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivo(s) acima do limite</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  O tamanho máximo permitido por arquivo é <strong>10 MB</strong>. Os arquivos abaixo foram bloqueados e não serão anexados:
                </p>
                <ul className="text-sm list-disc pl-5 max-h-48 overflow-auto">
                  {blockedFiles.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.name}</span>{" "}
                      <span className="text-muted-foreground">({(f.size / (1024 * 1024)).toFixed(1)} MB)</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Dica: compacte a imagem/PDF, divida o arquivo em partes menores ou envie apenas os arquivos dentro do limite.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedFiles([])}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}