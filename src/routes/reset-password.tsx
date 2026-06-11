import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha | Planejador" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Erro", { description: error.message });
      return;
    }
    toast.success("Senha atualizada");
    navigate({ to: "/principal", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-6 w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">Definir nova senha</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="np">Nova senha</Label>
            <Input id="np" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>Atualizar senha</Button>
        </form>
      </Card>
    </div>
  );
}