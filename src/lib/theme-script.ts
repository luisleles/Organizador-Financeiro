/**
 * Aplica o tema salvo antes da primeira pintura, para não piscar claro/escuro. Precisa ser
 * inline e síncrono: qualquer script externo chegaria tarde demais.
 *
 * O hash abaixo é o que a CSP libera. Passar um nonce aqui também funcionaria, mas o React
 * apaga o `nonce` do DOM depois de usá-lo, e a hidratação acusaria a diferença em toda
 * página. Com hash não há atributo nenhum para divergir. `theme-script.test.ts` garante que
 * os dois não saiam de sincronia.
 */
export const THEME_SCRIPT = `try{const t=localStorage.getItem("tema");if(t)document.documentElement.dataset.theme=t}catch{}`;

export const THEME_SCRIPT_HASH = "sha256-lbmioh9MupanSmiemMnufFLxfKy1I9/crEW7zRkKVsI=";
