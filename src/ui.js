export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function brl(v) {
  // Aceita número, string "10,50" ou "10.50" sem quebrar
  if (typeof v === "string") {
    v = v.trim().replace(/\./g, "").replace(",", ".");
  }
  const n = Number(v || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;

  // Opcional e seguro: ajusta a cor da barra do navegador no mobile
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f6f7fb" : "#070A14");
}

export function setBrand(name) {
  const el = qs("#brandName");
  if (el) el.textContent = name ? name : "Doce Lucro";

  const el2 = qs("#brandSub");
  if (el2) el2.textContent = "Lucro real em segundos";
}