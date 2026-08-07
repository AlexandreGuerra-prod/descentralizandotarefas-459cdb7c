import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { todayISO, type Task } from "@/lib/task-utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda | Planejador" }] }),
  component: AgendaPage,
});

const PRIO_COLOR: Record<string, string> = {
  altissima: "#dc2626",
  alta: "#ea580c",
  media: "#ca8a04",
  baixa: "#16a34a",
  irrelevante: "#64748b",
};

function AgendaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [periodo, setPeriodo] = useState<{ mes: string; inicio: Date; fim: Date } | null>(null);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "agenda"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("data");
      if (error) throw error;
      return data as Task[];
    },
  });

  const events = useMemo(
    () =>
      tasks.map((t) => {
        const start = t.prazo ?? `${t.data}T09:00:00`;
        const done = t.status === "concluida";
        const color = PRIO_COLOR[t.prioridade] ?? "#64748b";
        return {
          id: t.id,
          title: (done ? "✓ " : "") + t.titulo,
          start,
          allDay: !t.prazo,
          backgroundColor: done ? "#94a3b8" : color,
          borderColor: done ? "#94a3b8" : color,
          textColor: "#fff",
          classNames: done ? ["opacity-70", "line-through"] : [],
          extendedProps: { task: t },
        };
      }),
    [tasks],
  );

  // Mapa "YYYY-MM-DD" -> possui tarefa, usado pro círculo nos dias do calendário
  const diasComTarefas = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const d = t.prazo ? new Date(t.prazo) : new Date(t.data + "T00:00:00");
      set.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
    return set;
  }, [tasks]);

  const resumoMes = useMemo(() => {
    if (!periodo) return null;
    let total = 0;
    let pendentes = 0;
    for (const t of tasks) {
      const d = t.prazo ? new Date(t.prazo) : new Date(t.data + "T00:00:00");
      if (d >= periodo.inicio && d < periodo.fim) {
        total++;
        if (t.status !== "concluida") pendentes++;
      }
    }
    return { total, pendentes, mes: periodo.mes };
  }, [tasks, periodo]);

  async function handleExportIcs() {
    const { createEvents } = await import("ics");
    const evts = tasks.map((t) => {
      const d = t.prazo ? new Date(t.prazo) : new Date(t.data + "T09:00:00");
      return {
        uid: t.id + "@planejador",
        title: t.titulo,
        description: [t.descricao, t.solucao && `Solução: ${t.solucao}`, t.nup && `NUP: ${t.nup}`]
          .filter(Boolean)
          .join("\n"),
        start: [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()] as [
          number, number, number, number, number,
        ],
        duration: { hours: 1 },
        status: (t.status === "concluida" ? "CONFIRMED" : "TENTATIVE") as "CONFIRMED" | "TENTATIVE",
        categories: [t.tipo, t.prioridade],
      };
    });
    const { error, value } = createEvents(evts);
    if (error) {
      toast.error("Erro ao gerar .ics", { description: error.message });
      return;
    }
    const blob = new Blob([value!], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agenda-${todayISO()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Agenda exportada (.ics)");
  }

  async function handleImportIcs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ICAL = (await import("ical.js")).default;
      const text = await file.text();
      const jcal = ICAL.parse(text);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents("vevent");
      if (vevents.length === 0) throw new Error("Nenhum evento encontrado");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão inválida");
      const rows = vevents.map((v: unknown) => {
        const ev = new ICAL.Event(v as never);
        const start = ev.startDate.toJSDate();
        const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
        return {
          user_id: user.id,
          titulo: (ev.summary || "Sem título").slice(0, 500),
          descricao: ev.description || null,
          data: iso,
          prazo: ev.startDate.isDate ? null : start.toISOString(),
          tipo: "pessoal" as const,
          prioridade: "media" as const,
          recorrencia: "nenhuma" as const,
          status: "pendente" as const,
        };
      });
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} evento(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      toast.error("Falha ao importar", { description: (err as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">Visão de calendário das suas tarefas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportIcs}>
            <Download className="h-4 w-4 mr-1" /> Exportar .ics
          </Button>
          <label>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={handleImportIcs}
            />
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> Importar .ics</span>
            </Button>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">

      {resumoMes && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          {resumoMes.total === 0 ? (
            <>Nenhuma tarefa agendada para <span className="font-semibold capitalize">{resumoMes.mes}</span>.</>
          ) : (
            <>
              Você tem <span className="font-semibold">{resumoMes.total}</span>{" "}
              {resumoMes.total === 1 ? "tarefa agendada" : "tarefas agendadas"} para{" "}
              <span className="font-semibold capitalize">{resumoMes.mes}</span>
              {resumoMes.pendentes > 0 && <> — {resumoMes.pendentes} pendente{resumoMes.pendentes > 1 ? "s" : ""}</>}.
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {Object.entries(PRIO_COLOR).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: c }} /> {k}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-slate-400" /> concluída
        </span>
      </div>

      <Card className="p-2 sm:p-4 overflow-hidden">
        <div className="fc-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={isMobile ? "listWeek" : "dayGridMonth"}
            locale={ptBrLocale}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: isMobile
                ? "dayGridMonth,listWeek"
                : "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia", list: "Lista" }}
            events={events}
            height="auto"
            contentHeight="auto"
            aspectRatio={isMobile ? 0.8 : 1.6}
            dayMaxEvents={3}
            firstDay={0}
            nowIndicator
            datesSet={(arg) => {
              const ref = new Date(arg.view.currentStart);
              const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
              const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
              const mes = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              setPeriodo((p) =>
                p && p.inicio.getTime() === inicio.getTime() ? p : { mes, inicio, fim },
              );
            }}
            dayCellClassNames={(arg) => {
              const d = arg.date;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return diasComTarefas.has(key) ? ["fc-day-has-tasks"] : [];
            }}
            eventClick={(info) => {
              const t = info.event.extendedProps.task as Task;
              navigate({ to: "/cadastro/$id", params: { id: t.id } });
            }}
            dateClick={() => {
              navigate({ to: "/cadastro" });
            }}
          />
        </div>
      </Card>
    </div>
  );
}