export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function brl(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
}

export function setBrand(name) {
  const el = qs("#brandName");
  if (el) el.textContent = name ? name : "Doce Lucro";
  const el2 = qs("#brandSub");
  if (el2) el2.textContent = name ? "Lucro real em segundos" : "Lucro real em segundos";
}