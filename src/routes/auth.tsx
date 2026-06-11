import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff, CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Planejador de Tarefas" },
      { name: "description", content: "Acesse o Planejador de Tarefas Diárias." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/principal", replace: true });
    });
  }, [navigate]);

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Falha no login Google", { description: String(result.error?.message ?? result.error) });
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/principal", replace: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Erro ao entrar", { description: error.message });
      return;
    }
    navigate({ to: "/principal", replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) {
      const msg = /autorizado/i.test(error.message)
        ? "Este e-mail não está autorizado a usar o Planejador."
        : error.message;
      toast.error("Erro ao criar conta", { description: msg });
      return;
    }
    toast.success("Conta criada", { description: "Verifique seu e-mail para confirmar." });
    setTab("login");
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro", { description: error.message });
      return;
    }
    toast.success("E-mail enviado", { description: "Verifique sua caixa de entrada." });
    setTab("login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
            <CalendarCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Planejador de Tarefas</h1>
          <p className="text-sm text-muted-foreground">Acesso restrito aos usuários autorizados</p>
        </div>

        <Card className="p-6">
          <Button
            type="button"
            variant="outline"
            className="w-full mb-4"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09A7.05 7.05 0 0 1 5.46 12c0-.73.13-1.44.36-2.09V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            Entrar com Google
          </Button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou com e-mail</span></div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {tab === "forgot" ? (
                <form onSubmit={handleForgot} className="space-y-3 mt-4">
                  <div>
                    <Label htmlFor="email-fp">E-mail</Label>
                    <Input id="email-fp" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Enviar instruções
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setTab("login")}>
                    Voltar
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-3 mt-4">
                  <div>
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Input id="password" type={showPwd ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Entrar
                  </Button>
                  <button type="button" className="text-sm text-primary hover:underline w-full text-center" onClick={() => setTab("forgot")}>
                    Esqueci minha senha
                  </button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3 mt-4">
                <div>
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="email-s">E-mail autorizado</Label>
                  <Input id="email-s" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="password-s">Senha</Label>
                  <Input id="password-s" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
        <p className="text-xs text-muted-foreground text-center mt-4">
          Apenas e-mails da lista autorizada conseguem entrar.
        </p>
      </div>
    </div>
  );
}