import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Pencil, Trash2, Mail, MessageCircle, AlertTriangle, Repeat, Clock, Siren, StickyNote } from "lucide-react";
import { priorityClasses, PRIORITY_LABEL, RECURRENCE_LABEL, isOverdueOrSoon, type Task } from "@/lib/task-utils";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  task: Task;
  onToggle: (task: Task, solucao?: string) => void;
  onDelete: (task: Task) => void;
  onCopy?: (task: Task) => void;
}

export function TaskCard({ task, onToggle, onDelete, onCopy }: Props) {
  const overdue = task.status === "pendente" && isOverdueOrSoon(task.prazo);
  const urgent = task.prioridade === "altissima" || task.prioridade === "alta";
  const [completeOpen, setCompleteOpen] = useState(false);
  const [solucao, setSolucao] = useState(task.solucao ?? "");

  function formatDeadline(dt: string | null): string {
    if (!dt) return "Sem prazo";
    const d = new Date(dt);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function copyText() {
    const text = `${task.titulo}${task.descricao ? "\n" + task.descricao : ""}${task.prazo ? "\nPrazo: " + formatDeadline(task.prazo) : ""}${task.nup ? "\nNUP: " + task.nup : ""}`;
    navigator.clipboard.writeText(text);
    onCopy?.(task);
  }

  function avisarEmail() {
    const subject = encodeURIComponent(task.titulo);
    const body = encodeURIComponent(
      `${task.titulo}\n\n${task.descricao ?? ""}\n${task.prazo ? "Prazo: " + formatDeadline(task.prazo) : ""}${task.nup ? "\nNUP: " + task.nup : ""}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function avisarWhatsapp() {
    const text = encodeURIComponent(
      `*${task.titulo}*\n${task.descricao ?? ""}${task.prazo ? "\nPrazo: " + formatDeadline(task.prazo) : ""}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function handleCheckbox() {
    if (task.status === "pendente") {
      setCompleteOpen(true);
    } else {
      onToggle(task);
    }
  }

  function confirmComplete() {
    onToggle(task, solucao.trim() || undefined);
    setCompleteOpen(false);
  }

  return (
    <>
    <Card
      className={`p-4 bg-card ${priorityClasses(task.prioridade)} ${urgent && task.status === "pendente" ? "pulse-alert" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.status === "concluida"}
          onCheckedChange={handleCheckbox}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h3 className={`leading-tight flex items-center gap-2 ${task.status === "concluida" ? "line-through opacity-60" : ""}`}>
              {urgent && task.status === "pendente" && (
                <Siren className="h-5 w-5 siren-blink shrink-0" aria-label="Alerta de prioridade" />
              )}
              {task.numero != null && (
                <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                  #{task.numero}
                </span>
              )}
              {task.titulo}
            </h3>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {PRIORITY_LABEL[task.prioridade]}
              </Badge>
              {task.tipo === "profissional" && (
                <Badge variant="secondary" className="text-xs">Profissional</Badge>
              )}
              {task.recorrencia !== "nenhuma" && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Repeat className="h-3 w-3" /> {RECURRENCE_LABEL[task.recorrencia]}
                </Badge>
              )}
            </div>
          </div>
          {task.descricao && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{task.descricao}</p>}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            <span className={`flex items-center gap-1 ${overdue ? "text-destructive font-semibold" : ""}`}>
              {overdue && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" /> {formatDeadline(task.prazo)}
            </span>
            {task.nup && <span>NUP: {task.nup}</span>}
            {task.responsavel && <span>Resp.: {task.responsavel}</span>}
            {task.origem && <span>Origem: {task.origem}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-3">
            <Button size="sm" variant="ghost" onClick={copyText}><Copy className="h-3 w-3 mr-1" />Copiar</Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/cadastro/$id" params={{ id: task.id }}><Pencil className="h-3 w-3 mr-1" />Editar</Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link
                to="/anotacoes"
                search={{ taskId: task.id, titulo: task.titulo, numero: task.numero ?? undefined }}
              >
                <StickyNote className="h-3 w-3 mr-1" />Nota
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={avisarEmail}><Mail className="h-3 w-3 mr-1" />Avisar</Button>
            <Button size="sm" variant="ghost" onClick={avisarWhatsapp}><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(task)} className="text-destructive">
              <Trash2 className="h-3 w-3 mr-1" />Excluir
            </Button>
          </div>
        </div>
      </div>
    </Card>
    <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tarefa</DialogTitle>
          <DialogDescription>
            Descreva a solução dada para "{task.titulo}". Esse texto fica salvo no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`sol-${task.id}`}>Solução / observações</Label>
          <Textarea
            id={`sol-${task.id}`}
            rows={5}
            value={solucao}
            onChange={(e) => setSolucao(e.target.value)}
            placeholder="Como a tarefa foi resolvida?"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
          <Button onClick={confirmComplete}>Marcar como concluída</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}