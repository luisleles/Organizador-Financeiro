import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import {
  buildBalanceProjection,
  firstNegativeDay,
  lowestDay,
  type ProjectionEvent,
} from "./recurrence.projection";

const dia = (iso: string) => new Date(`${iso}T03:00:00.000Z`);

const evento = (iso: string, amountCents: number, label = "evento"): ProjectionEvent => ({
  date: dia(iso),
  amountCents,
  label,
  kind: "recorrencia",
});

describe("buildBalanceProjection", () => {
  it("mantém o saldo quando não há evento nenhum", () => {
    const projecao = buildBalanceProjection({
      openingCents: 50_000,
      from: dia("2026-08-20"),
      days: 3,
      events: [],
    });

    expect(projecao).toHaveLength(4);
    expect(projecao.every((ponto) => ponto.balanceCents === 50_000)).toBe(true);
  });

  it("aplica o evento no dia em que ele cai", () => {
    const projecao = buildBalanceProjection({
      openingCents: 10_000,
      from: dia("2026-08-20"),
      days: 3,
      events: [evento("2026-08-22", -4_000)],
    });

    expect(projecao.map((ponto) => ponto.balanceCents)).toEqual([10_000, 10_000, 6_000, 6_000]);
    expect(projecao[2].changeCents).toBe(-4_000);
  });

  it("soma vários eventos do mesmo dia num degrau só", () => {
    const projecao = buildBalanceProjection({
      openingCents: 0,
      from: dia("2026-08-20"),
      days: 1,
      events: [evento("2026-08-21", 30_000, "salário"), evento("2026-08-21", -12_000, "aluguel")],
    });

    expect(projecao[1].changeCents).toBe(18_000);
    expect(projecao[1].events).toHaveLength(2);
  });

  it("ignora evento fora da janela projetada", () => {
    const projecao = buildBalanceProjection({
      openingCents: 1_000,
      from: dia("2026-08-20"),
      days: 2,
      events: [evento("2026-09-30", -900_000)],
    });

    expect(projecao.at(-1)?.balanceCents).toBe(1_000);
  });

  it("marca como negativo só os dias em que o saldo fica abaixo de zero", () => {
    const projecao = buildBalanceProjection({
      openingCents: 5_000,
      from: dia("2026-08-20"),
      days: 3,
      events: [evento("2026-08-21", -8_000), evento("2026-08-23", 10_000)],
    });

    expect(projecao.map((ponto) => ponto.negative)).toEqual([false, true, true, false]);
  });
});

describe("firstNegativeDay", () => {
  it("aponta a data limite para agir", () => {
    const projecao = buildBalanceProjection({
      openingCents: 5_000,
      from: dia("2026-08-20"),
      days: 5,
      events: [evento("2026-08-23", -6_000)],
    });

    const primeiro = firstNegativeDay(projecao);
    expect(primeiro && formatDate(primeiro.date)).toBe("23/08/2026");
  });

  it("devolve nulo quando o saldo nunca fica negativo", () => {
    const projecao = buildBalanceProjection({
      openingCents: 100,
      from: dia("2026-08-20"),
      days: 2,
      events: [],
    });

    expect(firstNegativeDay(projecao)).toBeNull();
  });

  it("zerado não é negativo", () => {
    const projecao = buildBalanceProjection({
      openingCents: 1_000,
      from: dia("2026-08-20"),
      days: 1,
      events: [evento("2026-08-21", -1_000)],
    });

    expect(firstNegativeDay(projecao)).toBeNull();
  });
});

describe("lowestDay", () => {
  it("acha o fundo do poço, mesmo depois de o saldo voltar ao azul", () => {
    const projecao = buildBalanceProjection({
      openingCents: 20_000,
      from: dia("2026-08-20"),
      days: 4,
      events: [evento("2026-08-21", -30_000), evento("2026-08-23", 50_000)],
    });

    const menor = lowestDay(projecao);
    expect(menor?.balanceCents).toBe(-10_000);
    expect(menor && formatDate(menor.date)).toBe("21/08/2026");
  });
});
