/**
 * Regras de categorização automática: "se a descrição contém X, use a categoria Y".
 *
 * O casamento ignora acento e caixa porque ninguém digita "Mercado Pão de Açúcar" duas
 * vezes do mesmo jeito. Módulo puro: a mesma função vale para o lançamento manual de
 * hoje e para o import de extrato de amanhã.
 */

export type MatchableRule = {
  id: string;
  pattern: string;
  categoryId: string;
  priority: number;
  active: boolean;
};

const DIACRITICS = /\p{Diacritic}/gu;

export function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase("pt-BR").trim();
}

export function ruleMatches(description: string, pattern: string): boolean {
  const needle = normalizeForMatch(pattern);
  if (needle === "") return false;

  return normalizeForMatch(description).includes(needle);
}

/**
 * Ordem de avaliação: prioridade menor primeiro; empatou, ganha o padrão mais longo,
 * porque "uber eats" é mais específico que "uber" e deve vencer.
 */
export function orderRules(rules: readonly MatchableRule[]): MatchableRule[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority || b.pattern.length - a.pattern.length || a.id.localeCompare(b.id),
  );
}

export function findMatchingRule(
  description: string,
  rules: readonly MatchableRule[],
): MatchableRule | null {
  const active = orderRules(rules.filter((rule) => rule.active));
  return active.find((rule) => ruleMatches(description, rule.pattern)) ?? null;
}

/**
 * Categoria efetiva de um lançamento. Escolha explícita do usuário sempre vence: regra é
 * para preencher o que ficou em branco, não para corrigir quem já decidiu.
 */
export function resolveCategoryId(
  description: string,
  chosenCategoryId: string | null,
  rules: readonly MatchableRule[],
): string | null {
  if (chosenCategoryId) return chosenCategoryId;
  return findMatchingRule(description, rules)?.categoryId ?? null;
}
