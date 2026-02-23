export function calcCardFee(amount, metodo) {
  const a = Number(amount || 0);
  if (metodo !== "cartao") return 0;
  return a * 0.0299; // 2.99%
}

export function calcProfit(totalVenda, totalCusto, taxa) {
  return Number(totalVenda || 0) - Number(totalCusto || 0) - Number(taxa || 0);
}

export function calcMargin(preco, custo) {
  const p = Number(preco || 0);
  const c = Number(custo || 0);
  if (p <= 0) return 0;
  return ((p - c) / p) * 100;
}

export function calcROI(lucroUn, custo) {
  const l = Number(lucroUn || 0);
  const c = Number(custo || 0);
  if (c <= 0) return 0;
  return (l / c) * 100;
}