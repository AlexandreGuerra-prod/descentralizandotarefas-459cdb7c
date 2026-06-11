import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type SR = any;

export function MicButton({ onResult, lang = "pt-BR" }: { onResult: (text: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const rec: SR = new SpeechRecognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text) onResult(text.trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") toast.error("Permissão de microfone negada");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast.error("Erro de reconhecimento", { description: e.error });
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.stop(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    if (!supported) {
      toast.error("Seu navegador não suporta ditado por voz. Use Chrome ou Edge.");
      return;
    }
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        // already started
      }
    }
  }

  return (
    <Button
      type="button"
      variant={listening ? "default" : "outline"}
      size="icon"
      onClick={toggle}
      title={listening ? "Parar ditado" : "Ditar por voz"}
      className={listening ? "animate-pulse" : ""}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}