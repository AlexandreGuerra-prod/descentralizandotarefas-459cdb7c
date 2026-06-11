import type { Database } from "@/integrations/supabase/types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
export type Shortcut = Database["public"]["Tables"]["shortcuts"]["Row"];

export const PRIORITY_LABEL: Record<string, string> = {
  altissima: "Altíssima",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  irrelevante: "Irrelevante",
};

export const PRIORITY_ORDER: Record<string, number> = {
  altissima: 0,
  alta: 1,
  media: 2,
  baixa: 3,
  irrelevante: 4,
};

export const RECURRENCE_LABEL: Record<string, string> = {
  nenhuma: "Não repete",
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

export function priorityClasses(p: string): string {
  switch (p) {
    case "altissima":
      return "border-2 border-[color:var(--prio-altissima)] font-bold";
    case "alta":
      return "border border-[color:var(--prio-alta)] font-semibold";
    case "media":
      return "border border-[color:var(--prio-media)]/60";
    case "baixa":
      return "border border-[color:var(--prio-baixa)]/60";
    case "irrelevante":
      return "border border-[color:var(--prio-irrelevante)]/60 opacity-80";
    default:
      return "border border-border";
  }
}

export function isOverdueOrSoon(prazo: string | null): boolean {
  if (!prazo) return false;
  const due = new Date(prazo).getTime();
  const now = Date.now();
  // overdue or within next 6h
  return due - now < 6 * 60 * 60 * 1000;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addToDateISO(dateISO: string, recurrence: string): string {
  const d = new Date(dateISO + "T00:00:00");
  switch (recurrence) {
    case "diaria":
      d.setDate(d.getDate() + 1);
      break;
    case "semanal":
      d.setDate(d.getDate() + 7);
      break;
    case "mensal":
      d.setMonth(d.getMonth() + 1);
      break;
    case "anual":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ap = PRIORITY_ORDER[a.prioridade] ?? 9;
    const bp = PRIORITY_ORDER[b.prioridade] ?? 9;
    if (ap !== bp) return ap - bp;
    const ad = a.prazo ? new Date(a.prazo).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.prazo ? new Date(b.prazo).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
}