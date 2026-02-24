function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcCardFee(amount, metodo) {
  const a = toNumber(amount);
  if (metodo !== "cartao") return 0;

  // 2.99%
  const fee = a * 0.0299;
  return Number.isFinite(fee) ? fee : 0;
}

export function calcProfit(totalVenda, totalCusto, taxa) {
  const venda = toNumber(totalVenda);
  const custo = toNumber(totalCusto);
  const fee = toNumber(taxa);

  return venda - custo - fee;
}

export function calcMargin(preco, custo) {
  const p = toNumber(preco);
  const c = toNumber(custo);

  if (p <= 0) return 0;

  const margin = ((p - c) / p) * 100;
  return Number.isFinite(margin) ? margin : 0;
}

export function calcROI(lucroUn, custo) {
  const lucro = toNumber(lucroUn);
  const c = toNumber(custo);

  if (c <= 0) return 0;

  const roi = (lucro / c) * 100;
  return Number.isFinite(roi) ? roi : 0;
}