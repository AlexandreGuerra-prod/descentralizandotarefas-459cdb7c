import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ListChecks, PlusCircle, History, Settings, LogOut, CalendarCheck, CalendarDays, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

const NAV = [
  { to: "/principal", label: "Hoje", icon: ListChecks },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/cadastro", label: "Nova tarefa", icon: PlusCircle },
  { to: "/processos", label: "Processos", icon: Workflow },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({ children, userEmail }: { children: ReactNode; userEmail?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border p-4 gap-2">
        <Link to="/principal" className="flex items-center gap-2 px-2 py-3 mb-2">
          <CalendarCheck className="h-7 w-7 text-primary" />
          <div>
            <div className="font-bold leading-tight">Planejador</div>
            <div className="text-xs text-muted-foreground">Tarefas Diárias</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          {userEmail && (
            <div className="text-xs text-muted-foreground px-2 truncate" title={userEmail}>
              {userEmail}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-10 bg-sidebar/95 backdrop-blur border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
          <Link to="/principal" className="flex items-center gap-2 font-bold">
            <CalendarCheck className="h-5 w-5 text-primary" /> Planejador
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-6xl mx-auto">{children}</div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-sidebar/95 backdrop-blur border-t border-sidebar-border flex justify-around py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 text-xs px-3 py-1 rounded-md ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}