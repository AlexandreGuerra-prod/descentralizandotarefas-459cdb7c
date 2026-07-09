import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Palette, Plus, Search, Trash2, Download, Share2, X, FileText, FileCode,
  List, ArrowRight, CheckSquare, Type, ChevronDown, ChevronRight,
  Highlighter, Eraser, Link2, Link2Off,
} from "lucide-react";
import { MicButton } from "@/components/MicButton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/anotacoes")({
  head: () => ({ meta: [{ title: "Anotações | Planejador" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    titulo: typeof search.titulo === "string" ? search.titulo : undefined,
    numero:
      typeof search.numero === "number"
        ? search.numero
        : typeof search.numero === "string" && search.numero !== ""
        ? Number(search.numero)
        : undefined,
  }),
  component: AnotacoesPage,
});

type Note = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  plain_text: string;
  tags: string[];
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

const COLORS = ["#ef4444", "#f59e0b", "#eab308", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#111827", "#ffffff"];
const HIGHLIGHTS = ["#fef08a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fed7aa", "#fbcfe8", "#e5e7eb"];

function htmlToText(html: string) {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.innerText || tmp.textContent || "";
}

function htmlToMarkdown(html: string) {
  // Minimal conversion: bold/italic/underline + line breaks
  let md = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<(b|strong)>/gi, "**").replace(/<\/(b|strong)>/gi, "**")
    .replace(/<(i|em)>/gi, "*").replace(/<\/(i|em)>/gi, "*")
    .replace(/<u>/gi, "__").replace(/<\/u>/gi, "__")
    .replace(/<[^>]+>/g, "");
  md = md.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AnotacoesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { taskId, titulo: taskTitulo, numero: taskNumero } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const linkedHandledRef = useRef<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Note[];
    },
  });

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // Pre-select most recent note when nothing is selected
  useEffect(() => {
    if (taskId) return; // linked-note flow decides selection
    if (!selectedId && notes.length > 0 && typeof window !== "undefined" && window.innerWidth >= 768) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId, taskId]);

  // Linked-note flow: if arriving with ?taskId=..., open existing linked note or create one.
  useEffect(() => {
    if (!taskId || isLoading) return;
    if (linkedHandledRef.current === taskId) return;
    linkedHandledRef.current = taskId;
    (async () => {
      const existing = notes.find((n) => n.task_id === taskId);
      if (existing) {
        setSelectedId(existing.id);
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const label = taskTitulo ?? "tarefa";
        const numLabel = taskNumero != null ? `#${taskNumero} — ` : "";
        const { data, error } = await supabase.from("notes").insert({
          user_id: u.user.id,
          title: `Nota — ${numLabel}${label}`,
          content: "",
          plain_text: "",
          tags: [],
          task_id: taskId,
        }).select().single();
        if (error) { toast.error("Erro ao criar nota", { description: error.message }); return; }
        qc.invalidateQueries({ queryKey: ["notes"] });
        setSelectedId((data as Note).id);
      }
      // Clean the URL so a refresh doesn't recreate/reopen.
      navigate({ to: "/anotacoes", search: {}, replace: true });
    })();
  }, [taskId, isLoading, notes, taskTitulo, taskNumero, navigate, qc]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (tagFilter && !n.tags.includes(tagFilter)) return false;
      if (!term) return true;
      const date = new Date(n.created_at).toLocaleDateString("pt-BR");
      return (
        n.title.toLowerCase().includes(term) ||
        n.plain_text.toLowerCase().includes(term) ||
        n.tags.some((t) => t.toLowerCase().includes(term)) ||
        date.includes(term)
      );
    });
  }, [notes, search, tagFilter]);

  const recent = filtered.slice(0, 5);
  const older = filtered.slice(5);

  const createNote = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("não autenticado");
      const { data, error } = await supabase.from("notes").insert({
        user_id: u.user.id, title: "Nova nota", content: "", plain_text: "", tags: [],
      }).select().single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      setSelectedId(n.id);
    },
    onError: (e: any) => toast.error("Erro ao criar nota", { description: e.message }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      if (selectedId === id) setSelectedId(null);
      toast.success("Nota excluída");
    },
    onError: (e: any) => toast.error("Erro ao excluir", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Anotações</h1>
          <p className="text-sm text-muted-foreground">Planejamentos, ideias e lembretes.</p>
        </div>
        <Button onClick={() => createNote.mutate()}>
          <Plus className="h-4 w-4 mr-1" /> Nova nota
        </Button>
      </header>

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        {/* Sidebar list */}
        <aside className={`space-y-3 ${selected ? "hidden md:block" : ""}`}>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, texto, tag ou data"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tagFilter && (
                <Badge variant="default" className="cursor-pointer" onClick={() => setTagFilter(null)}>
                  {tagFilter} <X className="h-3 w-3 ml-1" />
                </Badge>
              )}
              {!tagFilter && allTags.map((t) => (
                <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => setTagFilter(t)}>
                  #{t}
                </Badge>
              ))}
            </div>
          )}
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
            )}
            {recent.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  Notas recentes
                </h2>
                {recent.map((n) => (
                  <Card
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`p-3 cursor-pointer hover:bg-accent transition shadow-sm ${
                      selectedId === n.id ? "ring-2 ring-primary bg-accent/40" : ""
                    }`}
                  >
                    <div className="font-medium truncate">{n.title || "Sem título"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(n.updated_at).toLocaleString("pt-BR")}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {n.plain_text.slice(0, 140) || "(vazia)"}
                    </div>
                    {n.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {n.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] py-0">#{t}</Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
            {older.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setShowOlder((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 hover:text-foreground"
                >
                  {showOlder ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Outras notas ({older.length})
                </button>
                {showOlder && (
                  <div className="space-y-0.5">
                    {older.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setSelectedId(n.id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 hover:bg-accent transition ${
                          selectedId === n.id ? "bg-accent ring-1 ring-primary" : ""
                        }`}
                      >
                        <span className="truncate flex-1">{n.title || "Sem título"}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(n.updated_at).toLocaleDateString("pt-BR")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className={selected ? "" : "hidden md:block"}>
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              onClose={() => setSelectedId(null)}
              onDelete={() => setConfirmDelete(selected.id)}
            />
          ) : (
            <Card className="p-8 text-center text-muted-foreground">
              Selecione ou crie uma nota.
            </Card>
          )}
        </section>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta nota?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDelete) deleteNote.mutate(confirmDelete); setConfirmDelete(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoteEditor({ note, onClose, onDelete }: { note: Note; onClose: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== note.content) {
      editorRef.current.innerHTML = note.content || "";
    }
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 600);
  }

  async function doSave() {
    const content = editorRef.current?.innerHTML ?? "";
    const plain_text = htmlToText(content);
    const { error } = await supabase.from("notes").update({
      title: title || "Sem título", content, plain_text, tags,
    }).eq("id", note.id);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    qc.invalidateQueries({ queryKey: ["notes"] });
  }

  function cmd(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  }

  function insertHTML(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  }

  function insertChecklist() {
    insertHTML(
      '<ul class="checklist"><li><input type="checkbox" />&nbsp;Item</li></ul><p><br/></p>'
    );
  }

  function insertArrowList() {
    insertHTML('<ul class="arrow-list"><li>Item</li></ul><p><br/></p>');
  }

  // Persist checkbox state: toggle the `checked` attribute on click and save.
  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      if (t.checked) t.setAttribute("checked", "");
      else t.removeAttribute("checked");
      scheduleSave();
      return;
    }
    const anchor = t.closest("a");
    if (anchor && anchor instanceof HTMLAnchorElement && anchor.href) {
      e.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
    }
  }

  function applyHighlight(color: string) {
    editorRef.current?.focus();
    // hiliteColor is the cross-browser name; fall back to backColor
    if (!document.execCommand("hiliteColor", false, color)) {
      document.execCommand("backColor", false, color);
    }
    scheduleSave();
  }

  function clearFormatting() {
    editorRef.current?.focus();
    document.execCommand("removeFormat");
    // removeFormat não limpa background em alguns browsers
    document.execCommand("hiliteColor", false, "transparent");
    scheduleSave();
  }

  function insertLink() {
    editorRef.current?.focus();
    const sel = window.getSelection();
    const selectedText = sel && !sel.isCollapsed ? sel.toString() : "";
    const url = window.prompt("Cole o endereço (URL) do link:", "https://");
    if (!url) return;
    let href = url.trim();
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
      href = "https://" + href;
    }
    const safeText = (selectedText || href).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeText}</a>&nbsp;`;
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  }

  function removeLink() {
    editorRef.current?.focus();
    document.execCommand("unlink");
    scheduleSave();
  }

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
    scheduleSave();
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
    scheduleSave();
  }

  function insertVoiceText(text: string) {
    editorRef.current?.focus();
    document.execCommand("insertText", false, " " + text);
    scheduleSave();
  }

  function exportTxt() {
    const text = htmlToText(editorRef.current?.innerHTML ?? "");
    downloadFile(`${title || "nota"}.txt`, `${title}\n\n${text}`, "text/plain;charset=utf-8");
  }

  function exportMd() {
    const md = htmlToMarkdown(editorRef.current?.innerHTML ?? "");
    const tagsLine = tags.length ? `\n\nTags: ${tags.map((t) => `#${t}`).join(" ")}` : "";
    downloadFile(`${title || "nota"}.md`, `# ${title}\n\n${md}${tagsLine}`, "text/markdown;charset=utf-8");
  }

  function shareWhatsApp() {
    const text = htmlToText(editorRef.current?.innerHTML ?? "");
    const tagsLine = tags.length ? `\n\n${tags.map((t) => `#${t}`).join(" ")}` : "";
    const msg = `*${title}*\n\n${text}${tagsLine}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const date = new Date(note.created_at).toLocaleDateString("pt-BR");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">Criada em {date}</span>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" title="Exportar">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportTxt}>
                <FileText className="h-4 w-4 mr-2" /> Exportar TXT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMd}>
                <FileCode className="h-4 w-4 mr-2" /> Exportar Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={shareWhatsApp} title="WhatsApp">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} title="Excluir">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {note.task_id && (
        <div className="text-xs">
          <Link
            to="/cadastro/$id"
            params={{ id: note.task_id }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 hover:bg-muted"
          >
            <FileText className="h-3 w-3" /> Vinculada a uma tarefa — abrir tarefa
          </Link>
        </div>
      )}

      <Input
        value={title}
        onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
        placeholder="Título"
        className="text-lg font-semibold"
      />

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => removeTag(t)}>
            #{t} <X className="h-3 w-3 ml-1" />
          </Badge>
        ))}
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          onBlur={addTag}
          placeholder="Adicionar tag…"
          className="h-7 w-32 text-xs"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border rounded-md p-1 bg-muted/30">
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("bold")} title="Negrito"><Bold className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("italic")} title="Itálico"><Italic className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("underline")} title="Sublinhado"><Underline className="h-4 w-4" /></Button>
        <span className="w-px h-5 bg-border mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" title="Tamanho da fonte"><Type className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => cmd("fontSize", "2")}>
              <span className="text-xs">A</span><span className="ml-2">Pequeno</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => cmd("fontSize", "3")}>
              <span className="text-sm">A</span><span className="ml-2">Padrão</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => cmd("fontSize", "5")}>
              <span className="text-lg">A</span><span className="ml-2">Grande</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("insertUnorderedList")} title="Lista com bullets"><List className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={insertArrowList} title="Lista com setas"><ArrowRight className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={insertChecklist} title="Checklist"><CheckSquare className="h-4 w-4" /></Button>
        <span className="w-px h-5 bg-border mx-1" />
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("justifyLeft")} title="Esquerda"><AlignLeft className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("justifyCenter")} title="Centralizado"><AlignCenter className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("justifyRight")} title="Direita"><AlignRight className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => cmd("justifyFull")} title="Justificado"><AlignJustify className="h-4 w-4" /></Button>
        <span className="w-px h-5 bg-border mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" title="Cor do texto"><Palette className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="grid grid-cols-5 gap-1 p-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-6 w-6 rounded border"
                  style={{ background: c }}
                  onClick={() => cmd("foreColor", c)}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" title="Marcar texto (destacar)"><Highlighter className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="grid grid-cols-4 gap-1 p-1">
              {HIGHLIGHTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-6 w-6 rounded border"
                  style={{ background: c }}
                  onClick={() => applyHighlight(c)}
                  aria-label={`Marcador ${c}`}
                />
              ))}
            </div>
            <DropdownMenuItem onClick={clearFormatting}>
              <Eraser className="h-4 w-4 mr-2" /> Limpar marcação
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="icon" onClick={insertLink} title="Inserir link"><Link2 className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" onClick={removeLink} title="Remover link"><Link2Off className="h-4 w-4" /></Button>
        <span className="w-px h-5 bg-border mx-1" />
        <MicButton onResult={insertVoiceText} />
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleSave}
        onClick={onEditorClick}
        onBlur={doSave}
        className="notes-editor min-h-[50vh] border rounded-md p-3 outline-none focus:ring-1 focus:ring-ring text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert"
      />
      <style>{`
        .notes-editor ul.arrow-list { list-style: none; padding-left: 1.25rem; }
        .notes-editor ul.arrow-list > li { position: relative; padding-left: 1.25rem; }
        .notes-editor ul.arrow-list > li::before {
          content: "→"; position: absolute; left: 0; color: hsl(var(--primary));
        }
        .notes-editor ul.checklist { list-style: none; padding-left: 0.25rem; }
        .notes-editor ul.checklist > li { display: flex; align-items: center; gap: 0.5rem; }
        .notes-editor ul.checklist input[type="checkbox"] { transform: scale(1.1); cursor: pointer; }
        .notes-editor a { color: #2563eb; text-decoration: underline; cursor: pointer; }
        .notes-editor a:hover { color: #1d4ed8; }
      `}</style>
    </Card>
  );
}