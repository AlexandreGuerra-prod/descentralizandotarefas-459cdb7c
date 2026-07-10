import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEBOUNCE_MS = 600;

/**
 * Autosave debounced de process_flows.drawio_xml — mesmo padrão (600ms,
 * grava o blob inteiro) do antigo canvas_extras em processos.$id.tsx,
 * agora como único campo de conteúdo do fluxo (ver Fase 3 do plano:
 * drawio_xml é a única fonte de verdade, as tabelas relacionais antigas
 * não ficam mais sincronizadas ao vivo).
 */
export function useProcessoAutosave(flowId: string) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (xml: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setSaving(true);
        const { error } = await supabase
          .from("process_flows")
          .update({ drawio_xml: xml })
          .eq("id", flowId);
        setSaving(false);
        if (error) toast.error("Erro ao salvar", { description: error.message });
        else setSavedAt(new Date());
      }, DEBOUNCE_MS);
    },
    [flowId],
  );

  return { save, saving, savedAt };
}
