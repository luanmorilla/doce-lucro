/* =========================================================
   BUSINESS LOGIC & CALCULATIONS (Doce Lucro)
========================================================= */

/**
 * Converte para número monetário seguro (sem NaN, sem negativos).
 * - Se não for número válido, vira 0
 * - Se for negativo, vira 0 (pra evitar taxa/lucro bizarro por input errado)
 */
function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/**
 * Arredonda para 2 casas (centavos).
 */
function round2(value) {
  return Math.round(toMoney(value) * 100) / 100;
}

/**
 * Calcula taxa de cartão baseado no método de pagamento
 * @param {number} value - Valor base a ser taxado (ex.: subtotal ou total final)
 * @param {string} method - Método: 'pix', 'dinheiro', 'cartao'
 * @returns {number} Taxa em reais (2 casas)
 */
export function calcCardFee(value, method) {
  const v = toMoney(value);

  if (method === "cartao") {
    // Taxa padrão: 2.99%
    return round2(v * 0.0299);
  }

  // Pix/dinheiro/outros: sem taxa
  return 0;
}

/**
 * Calcula lucro real
 * @param {number} revenue - Faturamento
 * @param {number} cost - Custo total
 * @param {number} fee - Taxa (cartão, etc)
 * @returns {number} Lucro (2 casas, pode ser negativo)
 */
export function calcProfit(revenue, cost, fee) {
  const r = Number(revenue);
  const c = Number(cost);
  const f = Number(fee);

  const rr = Number.isFinite(r) ? r : 0;
  const cc = Number.isFinite(c) ? c : 0;
  const ff = Number.isFinite(f) ? f : 0;

  // Lucro pode ser negativo (prejuízo), então não usamos toMoney aqui.
  return Math.round((rr - cc - ff) * 100) / 100;
}

/**
 * Calcula margem de lucro em percentual
 * @param {number} price - Preço de venda
 * @param {number} cost - Custo unitário
 * @returns {number} Margem em % (2 casas)
 */
export function calcMargin(price, cost) {
  const p = Number(price);
  const c = Number(cost);

  if (!Number.isFinite(p) || p <= 0) return 0;
  const cc = Number.isFinite(c) ? c : 0;

  const m = ((p - cc) / p) * 100;
  return Math.round(m * 100) / 100;
}

/**
 * Calcula ROI (Return on Investment)
 * @param {number} profit - Lucro
 * @param {number} investment - Investimento (custo)
 * @returns {number} ROI em % (2 casas)
 */
export function calcROI(profit, investment) {
  const p = Number(profit);
  const i = Number(investment);

  const pp = Number.isFinite(p) ? p : 0;
  const ii = Number.isFinite(i) ? i : 0;

  if (ii <= 0) return 0;

  const roi = (pp / ii) * 100;
  return Math.round(roi * 100) / 100;
}