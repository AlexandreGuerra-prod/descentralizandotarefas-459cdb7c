import { useEffect, useRef } from "react";
import { parseInboundMessage, postToIframe, type SelectedCell } from "./drawioProtocol";
import { unwrapMxfile } from "./xmlMapping";

export type InsertNodePayload = {
  id: string;
  label: string;
  attrs: Record<string, string>;
  style: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type DrawioEmbedApi = {
  /** Injeta um nó novo no diagrama atual — usado pelo fluxo "Adicionar
   * tarefa ao diagrama" (o nó precisa de um tasks.id real antes de
   * existir, criado fora do canvas). NÃO usa {action:'merge'} nativo:
   * esse importa como página nova em vez de atualizar a atual
   * (confirmado empiricamente) — a inserção é feita por uma ação
   * customizada tratada pelo plugin no repo fluxograma. */
  insertNode: (node: InsertNodePayload) => void;
  /** Atualiza estilo/atributos de uma célula já existente — usado pela
   * mini-toolbar (cor, red flag, tipo de etapa etc.), já que o Format
   * panel nativo do draw.io fica desligado no modo chromeless. */
  updateCell: (cellId: string, patch: { style?: string; attrs?: Record<string, string> }) => void;
  requestExport: (format: "png" | "svg" | "xml") => void;
};

type Props = {
  embedUrl: string;
  initialXml: string;
  onXmlChange: (xml: string) => void;
  onTaskClick: (taskId: string, cellId: string) => void;
  onSelectionChange: (cells: SelectedCell[]) => void;
  onExport?: (format: string, data: string) => void;
  onReady?: (api: DrawioEmbedApi) => void;
};

/**
 * Wrapper do iframe do draw.io embutido (embed=1&proto=json). Protocolo
 * confirmado empiricamente (ver fluxograma/plugins/tarefas-integration.js
 * e as spikes da Fase 0/1) — não é suposição de documentação.
 *
 * `ui=min` sem `chrome=0`: liga o modo chromeless (sem menu/sidebar
 * nativos) mantendo o grafo editável — `chrome=0` sozinho deixa o
 * draw.io somente-leitura, descoberto ao testar de verdade.
 */
export function DrawioEmbed({
  embedUrl,
  initialXml,
  onXmlChange,
  onTaskClick,
  onSelectionChange,
  onExport,
  onReady,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initialXmlRef = useRef(initialXml);
  initialXmlRef.current = initialXml;

  const onXmlChangeRef = useRef(onXmlChange);
  onXmlChangeRef.current = onXmlChange;
  const onTaskClickRef = useRef(onTaskClick);
  onTaskClickRef.current = onTaskClick;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onExportRef = useRef(onExport);
  onExportRef.current = onExport;

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = parseInboundMessage(e.data);
      if (!msg) return;

      switch (msg.event) {
        case "init": {
          const win = iframeRef.current?.contentWindow;
          if (win) {
            postToIframe(win, { action: "load", xml: initialXmlRef.current, autosave: 1 });
          }
          break;
        }
        case "autosave": {
          if (msg.xml) onXmlChangeRef.current(unwrapMxfile(msg.xml));
          break;
        }
        case "taskClick": {
          onTaskClickRef.current(msg.taskId, msg.cellId);
          break;
        }
        case "selectionChange": {
          onSelectionChangeRef.current(msg.cells);
          break;
        }
        case "export": {
          onExportRef.current?.(msg.format ?? "png", msg.data);
          break;
        }
        case "tarefasError": {
          console.error("[drawio-embed]", msg.message);
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!onReady) return;
    onReady({
      insertNode: (node) => {
        const win = iframeRef.current?.contentWindow;
        if (win) postToIframe(win, { action: "tarefasInsertNode", ...node });
      },
      updateCell: (cellId, patch) => {
        const win = iframeRef.current?.contentWindow;
        if (win) postToIframe(win, { action: "tarefasUpdateCell", cellId, ...patch });
      },
      requestExport: (format) => {
        const win = iframeRef.current?.contentWindow;
        if (win) postToIframe(win, { action: "export", format });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const src = `${embedUrl.replace(/\/$/, "")}/embed-tarefas.html?embed=1&proto=json&ui=min&spin=1`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Editor de processo"
      className="w-full h-full border-0"
    />
  );
}
