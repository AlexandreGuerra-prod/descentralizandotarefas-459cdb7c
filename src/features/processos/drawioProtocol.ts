/**
 * Contrato tipado do protocolo postMessage do draw.io embutido
 * (embed=1&proto=json). Confirmado empiricamente contra o bundle real
 * (ver plugins/tarefas-integration.js no repo fluxograma) — não é
 * suposição de documentação.
 */

// --- Mensagens que o parent (este app) recebe do iframe ---

export type DrawioInboundMessage =
  | { event: "init" }
  | { event: "configure" }
  | { event: "load"; xml: string; checksum?: string; [k: string]: unknown }
  | { event: "autosave"; xml?: string; patch?: unknown; checksum?: string }
  | { event: "save"; xml: string }
  | { event: "export"; data: string; xml?: string; format?: string }
  | { event: "merge"; error?: string }
  | { event: "exit" }
  // Eventos customizados do plugins/tarefas-integration.js (não nativos do draw.io):
  | { event: "taskClick"; taskId: string; cellId: string }
  | { event: "selectionChange"; cells: SelectedCell[] }
  | { event: "tarefasError"; message: string };

export type SelectedCell = {
  cellId: string;
  isVertex: boolean;
  isEdge: boolean;
  style: string;
  attrs: Record<string, string>;
};

// --- Mensagens que o parent envia para o iframe ---

export type DrawioOutboundMessage =
  | { action: "load"; xml: string; autosave?: 1; diffSync?: boolean }
  | { action: "configure"; config: DrawioConfig }
  | { action: "export"; format: "png" | "svg" | "xml" | "xmlpng" }
  | { action: "exit" }
  // Ações customizadas tratadas por plugins/tarefas-integration.js (repo
  // fluxograma) — NÃO usam o {action:'merge'} nativo do draw.io porque
  // esse mecanismo importa o XML recebido como uma PÁGINA NOVA inteira em
  // vez de atualizar a célula na página atual (confirmado empiricamente).
  | {
      action: "tarefasInsertNode";
      id: string;
      label: string;
      attrs: Record<string, string>;
      style: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }
  | { action: "tarefasUpdateCell"; cellId: string; style?: string; attrs?: Record<string, string> };

export type DrawioConfig = {
  presetColors?: string[];
  defaultColors?: string[];
  colorNames?: Record<string, string>;
  customCss?: string;
};

export function parseInboundMessage(raw: unknown): DrawioInboundMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed != null && typeof parsed === "object" && typeof parsed.event === "string") {
      return parsed as DrawioInboundMessage;
    }
  } catch {
    // não era JSON do draw.io — ignora
  }
  return null;
}

export function postToIframe(win: Window, msg: DrawioOutboundMessage) {
  win.postMessage(JSON.stringify(msg), "*");
}
