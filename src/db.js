/* =========================================================
   DOCE LUCRO — DB / CÁLCULOS
========================================================= */

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------------
   TAXA CARTÃO
--------------------------------------------------------- */
export function calcCardFee(amount, metodo) {
  const a = toNumber(amount);
  if (metodo !== "cartao") return 0;

  // 2.99%
  const fee = a * 0.0299;
  return Number.isFinite(fee) ? fee : 0;
}

/* ---------------------------------------------------------
   LUCRO DE VENDA
--------------------------------------------------------- */
export function calcProfit(totalVenda, totalCusto, taxa) {
  const venda = toNumber(totalVenda);
  const custo = toNumber(totalCusto);
  const fee = toNumber(taxa);

  return venda - custo - fee;
}

/* ---------------------------------------------------------
   MARGEM %
--------------------------------------------------------- */
export function calcMargin(preco, custo) {
  const p = toNumber(preco);
  const c = toNumber(custo);

  if (p <= 0) return 0;

  const margin = ((p - c) / p) * 100;
  return Number.isFinite(margin) ? margin : 0;
}

/* ---------------------------------------------------------
   ROI %
--------------------------------------------------------- */
export function calcROI(lucroUn, custo) {
  const lucro = toNumber(lucroUn);
  const c = toNumber(custo);

  if (c <= 0) return 0;

  const roi = (lucro / c) * 100;
  return Number.isFinite(roi) ? roi : 0;
}

/* =========================================================
   NOVO — SALDO REAL DO CAIXA
   (considera vendas + entradas - saídas)
========================================================= */

export function calcCashBalance(sales = [], cashMoves = []) {
  let totalVendas = 0;
  let totalSaidas = 0;

  for (const s of sales) {
    totalVendas += toNumber(s.total || s.valor || 0);
  }

  for (const m of cashMoves) {
    if (m.tipo === "saida") {
      totalSaidas += toNumber(m.valor);
    }
  }

  return totalVendas - totalSaidas;
}

/* =========================================================
   NOVO — TOTAL POR TIPO DE SAÍDA
========================================================= */

export function sumByCashType(cashMoves = [], tipoMov = "despesa") {
  return cashMoves
    .filter(m => m.tipo === "saida" && m.tipoMov === tipoMov)
    .reduce((acc, m) => acc + toNumber(m.valor), 0);
}