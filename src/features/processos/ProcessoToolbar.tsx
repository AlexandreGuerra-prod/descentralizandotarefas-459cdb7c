import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag, Bold } from "lucide-react";
import type { SelectedCell } from "./drawioProtocol";
import {
  COLORS,
  COLOR_BG,
  COLOR_BORDER,
  TEXT_COLORS,
  TEXT_COLOR,
  type FlowColor,
  type TextColor,
} from "./colorPalette";
import { shapeStyleFor, type EtapaTipo, type NodeTipo } from "./xmlMapping";

const ETAPA_LABEL: Record<EtapaTipo, string> = {
  inicio: "Início",
  intermediaria: "Intermediária",
  fim: "Fim",
  decisao: "Decisão",
};

const FONT_SIZES = [12, 14, 16, 20, 24, 32, 48] as const;

type Props = {
  selectedCells: SelectedCell[];
  onUpdateCell: (cellId: string, patch: { style?: string; attrs?: Record<string, string> }) => void;
};

/**
 * Mini-toolbar própria pros campos que não existem nativamente no
 * draw.io (cor da paleta de 9, red flag, tipo de etapa, duração,
 * comentário secundário) — necessária porque o embed roda em modo
 * chromeless (ui=min sem chrome=0: sem Format panel nativo, mas com o
 * grafo editável — ver DrawioEmbed.tsx). Só aparece quando exatamente um
 * nó "nosso" (com atributo nodeType) está selecionado.
 */
export function ProcessoToolbar({ selectedCells, onUpdateCell }: Props) {
  const cell = selectedCells.length === 1 ? selectedCells[0] : null;
  const nodeType = cell?.attrs.nodeType as NodeTipo | undefined;

  if (!cell || !cell.isVertex || !nodeType) {
    return (
      <div className="border rounded-md p-3 text-sm text-muted-foreground">
        Selecione um nó para editar.
      </div>
    );
  }

  const tipo: NodeTipo = nodeType;
  const cellId: string = cell.cellId;
  const cor = (cell.attrs.cor as FlowColor) ?? "blue";
  const corTexto = (cell.attrs.cor_texto as TextColor) ?? "black";
  const etapaTipo = (cell.attrs.etapa_tipo as EtapaTipo) ?? "intermediaria";
  const redFlag = cell.attrs.red_flag === "1";
  const duracao = cell.attrs.duracao_estimada_minutes ?? "";
  const notaSecundaria = cell.attrs.nota_secundaria ?? "";
  const negrito = cell.attrs.negrito === "1";
  const sombra = cell.attrs.sombra === "1";
  const fontSize = cell.attrs.font_size ?? "";

  type PatchableAttr =
    | "cor"
    | "cor_texto"
    | "etapa_tipo"
    | "red_flag"
    | "duracao_estimada_minutes"
    | "nota_secundaria"
    | "negrito"
    | "sombra"
    | "font_size";

  function patch(nextAttrs: Partial<Record<PatchableAttr, string>>) {
    const nextCor = (nextAttrs.cor as FlowColor) ?? cor;
    const nextCorTexto = (nextAttrs.cor_texto as TextColor) ?? corTexto;
    const nextEtapaTipo = (nextAttrs.etapa_tipo as EtapaTipo) ?? etapaTipo;
    const nextNegrito = nextAttrs.negrito ?? (negrito ? "1" : "0");
    const nextSombra = nextAttrs.sombra ?? (sombra ? "1" : "0");
    const nextFontSize = nextAttrs.font_size ?? fontSize;
    const style = shapeStyleFor({
      tipo,
      cor: nextCor,
      corTexto: nextCorTexto,
      etapaTipo: nextEtapaTipo,
      negrito: nextNegrito === "1",
      sombra: nextSombra === "1",
      fontSize: nextFontSize ? Number(nextFontSize) : null,
    });
    onUpdateCell(cellId, { style, attrs: nextAttrs });
  }

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div>
        <Label className="text-xs">Cor</Label>
        <div className="grid grid-cols-9 gap-1 mt-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="h-6 w-6 rounded border-2"
              style={{ background: COLOR_BG[c], borderColor: COLOR_BORDER[c] }}
              onClick={() => patch({ cor: c })}
              title={c}
            />
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs">Cor do texto</Label>
        <div className="flex gap-1 mt-1">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="h-6 w-6 rounded border-2 flex items-center justify-center text-xs font-bold"
              style={{ borderColor: TEXT_COLOR[c], color: TEXT_COLOR[c] }}
              onClick={() => patch({ cor_texto: c })}
              title={c}
            >
              A
            </button>
          ))}
        </div>
      </div>

      {nodeType !== "comentario" && (
        <div>
          <Label className="text-xs">Tipo de etapa</Label>
          <Select value={etapaTipo} onValueChange={(v) => patch({ etapa_tipo: v })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETAPA_LABEL) as EtapaTipo[]).map((et) => (
                <SelectItem key={et} value={et}>
                  {ETAPA_LABEL[et]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-xs">Duração estimada (min)</Label>
        <Input
          type="number"
          min={0}
          className="h-8"
          defaultValue={duracao}
          onBlur={(e) => patch({ duracao_estimada_minutes: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs">Comentário</Label>
        <Textarea
          rows={2}
          className="text-xs"
          defaultValue={notaSecundaria}
          onBlur={(e) => patch({ nota_secundaria: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs">Tamanho do texto</Label>
        <Select
          value={fontSize || "auto"}
          onValueChange={(v) => patch({ font_size: v === "auto" ? "" : v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Padrão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Padrão</SelectItem>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1">
        <Button
          size="sm"
          variant={negrito ? "default" : "outline"}
          className="flex-1"
          onClick={() => patch({ negrito: negrito ? "0" : "1" })}
          title="Negrito"
        >
          <Bold className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant={sombra ? "default" : "outline"}
          className="flex-1"
          onClick={() => patch({ sombra: sombra ? "0" : "1" })}
          title="Sombra"
        >
          <span style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.6)" }}>S</span>
        </Button>
      </div>

      <Button
        size="sm"
        variant={redFlag ? "default" : "outline"}
        className="w-full"
        onClick={() => patch({ red_flag: redFlag ? "0" : "1" })}
      >
        <Flag className={`h-3 w-3 mr-1 ${redFlag ? "fill-current" : ""}`} />
        Red flag
      </Button>
    </div>
  );
}
