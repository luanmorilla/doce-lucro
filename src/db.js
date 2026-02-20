/* =========================================================
   BUSINESS LOGIC & CALCULATIONS
========================================================= */

/**
 * Calcula taxa de cartão baseado no método de pagamento
 * @param {number} value - Valor da transação
 * @param {string} method - Método: 'pix', 'dinheiro', 'cartao'
 * @returns {number} Taxa em reais
 */
export function calcCardFee(value, method) {
  const v = Number(value || 0);

  // Pix: 0% (sem taxa)
  if (method === "pix") return 0;

  // Dinheiro: 0% (sem taxa)
  if (method === "dinheiro") return 0;

  // Cartão: 2.99% (taxa padrão)
  if (method === "cartao") {
    return v * 0.0299;
  }

  return 0;
}

/**
 * Calcula lucro real
 * @param {number} revenue - Faturamento
 * @param {number} cost - Custo total
 * @param {number} fee - Taxa (cartão, etc)
 * @returns {number} Lucro
 */
export function calcProfit(revenue, cost, fee) {
  const r = Number(revenue || 0);
  const c = Number(cost || 0);
  const f = Number(fee || 0);

  return r - c - f;
}

/**
 * Calcula margem de lucro em percentual
 * @param {number} price - Preço de venda
 * @param {number} cost - Custo unitário
 * @returns {number} Margem em %
 */
export function calcMargin(price, cost) {
  const p = Number(price || 0);
  const c = Number(cost || 0);

  if (p <= 0) return 0;

  return ((p - c) / p) * 100;
}

/**
 * Calcula ROI (Return on Investment)
 * @param {number} profit - Lucro
 * @param {number} investment - Investimento (custo)
 * @returns {number} ROI em %
 */
export function calcROI(profit, investment) {
  const p = Number(profit || 0);
  const i = Number(investment || 0);

  if (i <= 0) return 0;

  return (p / i) * 100;
}
