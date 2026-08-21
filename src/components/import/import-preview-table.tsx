"use client";

import { useMemo, useState } from "react";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { ImportPreview, PreviewRow } from "@/server/import/import.pipeline";

type Option = { id: string; name: string };

type ImportPreviewTableProps = {
  preview: ImportPreview;
  categories: readonly Option[];
  pending: boolean;
  onConfirm: (rows: ConfirmRow[]) => void;
  onCancel: () => void;
};

type ConfirmRow = {
  externalId: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
};

const STATUS_LABELS = {
  novo: "novo",
  duplicado: "já importado",
  "repetido-no-arquivo": "repetido no arquivo",
} as const;

/**
 * A revisão. Duplicado chega desmarcado e não dá para marcar: reimportar o mesmo lançamento
 * é justamente o erro que o pipeline existe para evitar. O que falta categoria fica visível
 * — dá para importar assim mesmo, mas não por descuido.
 */
export function ImportPreviewTable({
  preview,
  categories,
  pending,
  onConfirm,
  onCancel,
}: ImportPreviewTableProps) {
  const novos = useMemo(() => preview.rows.filter((row) => row.status === "novo"), [preview.rows]);

  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(novos.map((row) => row.externalId)),
  );
  const [categoryByRow, setCategoryByRow] = useState<Record<string, string>>({});

  const categoryOf = (row: PreviewRow) => categoryByRow[row.externalId] ?? row.categoryId ?? "";
  const selecionados = novos.filter((row) => selected.has(row.externalId));
  const semCategoria = selecionados.filter((row) => categoryOf(row) === "").length;
  const totalCents = selecionados.reduce((total, row) => total + row.amountCents, 0);

  function toggle(externalId: string) {
    setSelected((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(externalId)) proximo.delete(externalId);
      else proximo.add(externalId);
      return proximo;
    });
  }

  return (
    <Card
      title={`Revisão · ${preview.totals.total} ${preview.totals.total === 1 ? "linha" : "linhas"}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Resumo label="Novos" value={preview.totals.novos} tone="entrada" />
          <Resumo label="Já importados" value={preview.totals.duplicados} tone="previsto" />
          <Resumo label="Sem categoria" value={semCategoria} tone="alerta" />
          <span className="text-texto-fraco ml-auto flex items-center gap-2 text-xs">
            Selecionados: {selecionados.length}
            <Amount cents={totalCents} size="xs" tone="neutro" sign="always" />
          </span>
        </div>

        <Table caption="Lançamentos lidos do arquivo">
          <thead>
            <tr>
              <TableHeadCell className="w-10">
                <span className="sr-only">Importar</span>
              </TableHeadCell>
              <TableHeadCell>Data</TableHeadCell>
              <TableHeadCell>Descrição</TableHeadCell>
              <TableHeadCell className="hidden sm:table-cell">Categoria</TableHeadCell>
              <TableHeadCell value>Valor</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const importavel = row.status === "novo";
              const marcado = selected.has(row.externalId);

              return (
                <tr
                  key={row.externalId}
                  className={cn("hover:bg-fundo", !importavel && "opacity-55")}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={importavel && marcado}
                      disabled={!importavel || pending}
                      onChange={() => toggle(row.externalId)}
                      aria-label={`Importar ${row.description}`}
                      className="accent-foco size-4"
                    />
                  </TableCell>
                  <TableCell muted>
                    <span className="valor text-num-xs">{formatarData(row.date)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-texto text-sm">{row.description}</span>
                      {row.status !== "novo" && (
                        <Badge tone="previsto">{STATUS_LABELS[row.status]}</Badge>
                      )}
                      {importavel && categoryOf(row) === "" && (
                        <Badge tone="alerta">sem categoria</Badge>
                      )}
                      {row.categorySuggested && categoryOf(row) === row.categoryId && (
                        <Badge tone="entrada">sugerida por regra</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Select
                      value={categoryOf(row)}
                      disabled={!importavel || pending}
                      aria-label={`Categoria de ${row.description}`}
                      onChange={(event) =>
                        setCategoryByRow((atual) => ({
                          ...atual,
                          [row.externalId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell value>
                    <Amount
                      cents={row.amountCents}
                      size="sm"
                      tone={row.amountCents >= 0 ? "entrada" : "saida"}
                      sign="always"
                    />
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {semCategoria > 0 && (
            <p className="text-texto-fraco mr-auto text-xs">
              {semCategoria}{" "}
              {semCategoria === 1 ? "lançamento vai entrar" : "lançamentos vão entrar"} sem
              categoria. Dá para categorizar depois, no extrato.
            </p>
          )}
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Descartar
          </Button>
          <Button
            variant="primary"
            disabled={pending || selecionados.length === 0}
            onClick={() =>
              onConfirm(
                selecionados.map((row) => ({
                  externalId: row.externalId,
                  date: row.date,
                  description: row.description,
                  amountCents: row.amountCents,
                  categoryId: categoryOf(row) || null,
                })),
              )
            }
          >
            {pending ? "Importando…" : `Importar ${selecionados.length}`}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Resumo({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "entrada" | "previsto" | "alerta";
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-2xs text-texto-fraco font-semibold uppercase">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </span>
  );
}

function formatarData(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
