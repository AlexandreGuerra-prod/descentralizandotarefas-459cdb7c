import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // ANTES: supabase.auth.getUser(), que bate em /auth/v1/user pela REDE a
    // cada navegação — inclusive no redirect para /principal logo depois de
    // salvar. Qualquer oscilação do túnel/proxy devolvia `error` e o guard
    // tratava falha de rede como "não autenticado": o usuário caía na tela de
    // login no meio do trabalho, de forma intermitente e sem explicação.
    //
    // getSession() lê a sessão do localStorage e só vai à rede quando o token
    // realmente expirou. Não validar o JWT no cliente não afreouxa nada: quem
    // barra acesso indevido é o RLS no Postgres, e um token forjado aqui só
    // renderiza uma casca vazia — toda query volta sem linhas.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell userEmail={user.email ?? undefined}>
      <Outlet />
    </AppShell>
  );
}