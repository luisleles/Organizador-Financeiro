"use client";

import { useState, useTransition } from "react";
import { confirmImportAction, previewImportAction } from "@/app/(app)/importar/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { toISODate } from "@/lib/date";
import { DATE_FORMATS, detectDelimiter, parseDelimited } from "@/server/import/csv.parse";
import { IDLE_PREVIEW, type PreviewState } from "@/server/import/import.types";
import { ImportPreviewTable } from "./import-preview-table";

type Option = { id: string; name: string };

type ImportWorkspaceProps = {
  accounts: readonly Option[];
  categories: readonly Option[];
};

type SourceId = "csv" | "ofx";

type ColumnMapping = {
  date: number;
  description: number;
  amount: number;
  credit?: number;
  debit?: number;
  externalId?: number;
};

const SEM_COLUNA = -1;

export function ImportWorkspace({ accounts, categories }: ImportWorkspaceProps) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [sourceId, setSourceId] = useState<SourceId>("csv");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [since, setSince] = useState("");
  const [dateFormat, setDateFormat] = useState<(typeof DATE_FORMATS)[number]>("DD/MM/AAAA");
  const [headerRows, setHeaderRows] = useState(1);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: 0, description: 1, amount: 2 });
  const [preview, setPreview] = useState<PreviewState>(IDLE_PREVIEW);
  // Trocar a chave zera o <input type="file">, que senão continua exibindo o arquivo já
  // importado ao lado de um botão desabilitado.
  const [resetToken, setResetToken] = useState(0);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();

  const columns = sourceId === "csv" && text ? columnNames(text, headerRows) : [];

  async function handleFile(file: File | undefined) {
    if (!file) return;

    const conteudo = await file.text();
    const formato: SourceId = /\.ofx$/i.test(file.name) ? "ofx" : "csv";

    setFileName(file.name);
    setText(conteudo);
    setSourceId(formato);
    setPreview(IDLE_PREVIEW);

    if (formato === "csv") setMapping(guessMapping(conteudo, 1));
  }

  function handlePreview() {
    startTransition(async () => {
      const resultado = await previewImportAction({
        sourceId,
        accountId,
        text,
        since: since || null,
        dateFormat,
        headerRows,
        mapping,
      });

      setPreview(resultado);
      if (resultado.status === "error") notify(resultado.message, "alerta");
    });
  }

  function handleConfirm(
    rows: Parameters<typeof confirmImportAction>[0] extends never ? never : ConfirmRows,
  ) {
    startTransition(async () => {
      const resultado = await confirmImportAction({ sourceId, accountId, rows });

      if (resultado.status === "success") {
        notify(resultado.message, "entrada");
        setPreview(IDLE_PREVIEW);
        setText("");
        setFileName("");
        setResetToken((atual) => atual + 1);
      } else if (resultado.status === "error") {
        notify(resultado.message, "alerta");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Arquivo">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Extrato" htmlFor="arquivo" hint="CSV ou OFX exportado pelo banco.">
              <input
                key={resetToken}
                id="arquivo"
                type="file"
                accept=".csv,.txt,.ofx"
                onChange={(event) => handleFile(event.target.files?.[0])}
                className="border-linha text-texto file:bg-superficie-alta file:text-texto hover:border-linha-forte w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:px-3 file:py-1 file:text-sm"
              />
            </Field>

            <Field label="Conta de destino" htmlFor="conta">
              <Select id="conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Importar a partir de"
              htmlFor="desde"
              hint="Vazio importa o arquivo inteiro."
            >
              <Input
                id="desde"
                type="date"
                value={since}
                max={toISODate(new Date())}
                onChange={(event) => setSince(event.target.value)}
              />
            </Field>

            <Field label="Formato" htmlFor="formato">
              <Select
                id="formato"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value as SourceId)}
              >
                <option value="csv">CSV</option>
                <option value="ofx">OFX</option>
              </Select>
            </Field>
          </div>

          {fileName && (
            <p className="text-texto-fraco text-xs">
              {fileName} · {text.length.toLocaleString("pt-BR")} caracteres lidos
            </p>
          )}

          {sourceId === "csv" && columns.length > 0 && (
            <div className="border-linha flex flex-col gap-4 border-t pt-4">
              <p className="text-2xs text-texto-fraco font-semibold uppercase">
                Mapeamento das colunas
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ColumnField
                  label="Data"
                  columns={columns}
                  value={mapping.date}
                  onChange={(date) => setMapping((atual) => ({ ...atual, date }))}
                />
                <ColumnField
                  label="Descrição"
                  columns={columns}
                  value={mapping.description}
                  onChange={(description) => setMapping((atual) => ({ ...atual, description }))}
                />
                <ColumnField
                  label="Valor"
                  columns={columns}
                  value={mapping.amount}
                  onChange={(amount) => setMapping((atual) => ({ ...atual, amount }))}
                  optional
                />
                <ColumnField
                  label="Entrada (crédito)"
                  columns={columns}
                  value={mapping.credit ?? SEM_COLUNA}
                  onChange={(credit) =>
                    setMapping((atual) => ({
                      ...atual,
                      credit: credit === SEM_COLUNA ? undefined : credit,
                    }))
                  }
                  optional
                />
                <ColumnField
                  label="Saída (débito)"
                  columns={columns}
                  value={mapping.debit ?? SEM_COLUNA}
                  onChange={(debit) =>
                    setMapping((atual) => ({
                      ...atual,
                      debit: debit === SEM_COLUNA ? undefined : debit,
                    }))
                  }
                  optional
                />
                <ColumnField
                  label="Identificador"
                  columns={columns}
                  value={mapping.externalId ?? SEM_COLUNA}
                  onChange={(externalId) =>
                    setMapping((atual) => ({
                      ...atual,
                      externalId: externalId === SEM_COLUNA ? undefined : externalId,
                    }))
                  }
                  optional
                />

                <Field label="Formato da data" htmlFor="formato-data">
                  <Select
                    id="formato-data"
                    value={dateFormat}
                    onChange={(event) =>
                      setDateFormat(event.target.value as (typeof DATE_FORMATS)[number])
                    }
                  >
                    {DATE_FORMATS.map((formato) => (
                      <option key={formato} value={formato}>
                        {formato}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Linhas de cabeçalho" htmlFor="cabecalho">
                  <Input
                    id="cabecalho"
                    type="number"
                    numeric
                    min={0}
                    max={20}
                    value={headerRows}
                    onChange={(event) => setHeaderRows(Number(event.target.value))}
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handlePreview}
              disabled={pending || text === "" || accountId === ""}
            >
              {pending ? "Lendo…" : "Revisar antes de importar"}
            </Button>
          </div>
        </div>
      </Card>

      {preview.status === "ready" && (
        <ImportPreviewTable
          preview={preview.preview}
          categories={categories}
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(IDLE_PREVIEW)}
        />
      )}
    </div>
  );
}

type ConfirmRows = {
  externalId: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
}[];

function ColumnField({
  label,
  columns,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  columns: readonly string[];
  value: number;
  onChange: (value: number) => void;
  optional?: boolean;
}) {
  const id = `coluna-${label.toLowerCase().replace(/[^a-z]/g, "")}`;

  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {optional && <option value={SEM_COLUNA}>Não usar</option>}
        {columns.map((column, index) => (
          <option key={`${column}-${index}`} value={index}>
            {column}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Nomes do cabeçalho quando existe; senão, a posição, que é o que a pessoa vê no arquivo. */
function columnNames(text: string, headerRows: number): string[] {
  const linhas = parseDelimited(text, detectDelimiter(text));
  const cabecalho = headerRows > 0 ? linhas[0] : null;
  const largura = Math.max(...linhas.slice(0, 5).map((linha) => linha.length), 0);

  return Array.from({ length: largura }, (_, index) =>
    cabecalho?.[index] ? `${index + 1}. ${cabecalho[index]}` : `Coluna ${index + 1}`,
  );
}

/** Chute inicial pelo nome do cabeçalho, que a pessoa corrige na tela se estiver errado. */
function guessMapping(text: string, headerRows: number) {
  const nomes = columnNames(text, headerRows).map((nome) =>
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, ""),
  );

  const acha = (termos: string[], fallback: number) => {
    const indice = nomes.findIndex((nome) => termos.some((termo) => nome.includes(termo)));
    return indice === -1 ? fallback : indice;
  };

  return {
    date: acha(["data", "date"], 0),
    description: acha(["histor", "descri", "memo", "lancamento", "description"], 1),
    amount: acha(["valor", "amount", "montante"], 2),
  };
}
