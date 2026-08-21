import { addDays, fromZonedParts, isoDateKey, toDateParts } from "@/lib/date";

/**
 * Saldo projetado dia a dia. Módulo puro: recebe o saldo de hoje e os eventos previstos,
 * devolve a curva. Quem chama decide o que é evento — aqui não se sabe o que é recorrência
 * nem o que é fatura, só que dinheiro entra e sai em certos dias.
 */

export type ProjectionEventKind = "recorrencia" | "fatura";

export type ProjectionEvent = {
  date: Date;
  /** Assinado: negativo sai da conta. */
  amountCents: number;
  label: string;
  kind: ProjectionEventKind;
};

export type ProjectionDay = {
  date: Date;
  balanceCents: number;
  /** Soma dos eventos do dia, para o tooltip explicar o degrau. */
  changeCents: number;
  events: ProjectionEvent[];
  negative: boolean;
};

export type ProjectionInput = {
  /** Saldo disponível hoje, antes de qualquer evento futuro. */
  openingCents: number;
  from: Date;
  days: number;
  events: readonly ProjectionEvent[];
};

export function buildBalanceProjection({
  openingCents,
  from,
  days,
  events,
}: ProjectionInput): ProjectionDay[] {
  const byDay = new Map<string, ProjectionEvent[]>();
  for (const event of events) {
    const chave = isoDateKey(toDateParts(event.date));
    byDay.set(chave, [...(byDay.get(chave) ?? []), event]);
  }

  const inicio = toDateParts(from);
  const projecao: ProjectionDay[] = [];
  let saldo = openingCents;

  for (let index = 0; index <= days; index += 1) {
    const parts = addDays(inicio, index);
    const doDia = byDay.get(isoDateKey(parts)) ?? [];
    const changeCents = doDia.reduce((total, event) => total + event.amountCents, 0);
    saldo += changeCents;

    projecao.push({
      date: fromZonedParts(parts),
      balanceCents: saldo,
      changeCents,
      events: doDia,
      negative: saldo < 0,
    });
  }

  return projecao;
}

/** O primeiro dia no vermelho é o que interessa: é a data limite para fazer alguma coisa. */
export function firstNegativeDay(projecao: readonly ProjectionDay[]): ProjectionDay | null {
  return projecao.find((dia) => dia.negative) ?? null;
}

/** O fundo do poço do período, que pode ser bem depois do primeiro dia negativo. */
export function lowestDay(projecao: readonly ProjectionDay[]): ProjectionDay | null {
  return projecao.reduce<ProjectionDay | null>(
    (menor, dia) => (menor === null || dia.balanceCents < menor.balanceCents ? dia : menor),
    null,
  );
}
