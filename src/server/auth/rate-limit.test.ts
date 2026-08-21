import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllLoginAttempts,
  consumeLoginAttempt,
  peekLoginAttempt,
  resetLoginAttempts,
} from "./rate-limit";

const AGORA = 1_700_000_000_000;

beforeEach(() => {
  clearAllLoginAttempts();
});

describe("consumeLoginAttempt", () => {
  it("deixa passar as primeiras tentativas", () => {
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      expect(consumeLoginAttempt("alguem@example.com", AGORA)).toBe(true);
    }
  });

  it("bloqueia a partir da sexta tentativa na mesma janela", () => {
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }

    expect(consumeLoginAttempt("alguem@example.com", AGORA)).toBe(false);
  });

  it("conta cada chave separadamente", () => {
    for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
      consumeLoginAttempt("alvo@example.com", AGORA);
    }

    expect(consumeLoginAttempt("outro@example.com", AGORA)).toBe(true);
  });

  it("esquece tentativas antigas quando a janela passa", () => {
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }

    expect(consumeLoginAttempt("alguem@example.com", AGORA + 61_000)).toBe(true);
  });

  it("mantém o bloqueio durante a punição, mesmo com a janela vencida", () => {
    for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }

    expect(consumeLoginAttempt("alguem@example.com", AGORA + 61_000)).toBe(false);
    expect(consumeLoginAttempt("alguem@example.com", AGORA + 15 * 60_000 + 1)).toBe(true);
  });

  it("informa quanto falta para poder tentar de novo", () => {
    for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }

    const status = peekLoginAttempt("alguem@example.com", AGORA + 1000);
    expect(status.allowed).toBe(false);
    expect(status.retryAfterMs).toBeGreaterThan(0);
  });

  it("consultar não gasta tentativa", () => {
    expect(peekLoginAttempt("alguem@example.com", AGORA).remaining).toBe(5);
    expect(peekLoginAttempt("alguem@example.com", AGORA).remaining).toBe(5);

    consumeLoginAttempt("alguem@example.com", AGORA);
    expect(peekLoginAttempt("alguem@example.com", AGORA).remaining).toBe(4);
  });

  it("cinco tentativas seguidas de senha errada ainda deixam a sexta correta passar depois da janela", () => {
    for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }

    // A quinta ainda passa: o limite trava a partir da sexta.
    expect(consumeLoginAttempt("alguem@example.com", AGORA)).toBe(true);
  });

  it("zera o contador depois de um login que deu certo", () => {
    for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
      consumeLoginAttempt("alguem@example.com", AGORA);
    }
    resetLoginAttempts("alguem@example.com");

    expect(consumeLoginAttempt("alguem@example.com", AGORA)).toBe(true);
  });
});
