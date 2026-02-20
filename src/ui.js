/* =========================================================
   UI UTILITIES (Doce Lucro)
========================================================= */

/**
 * Formata um valor para BRL com segurança (não explode com NaN/string/etc).
 */
export function brl(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * QuerySelector com root opcional (default: document).
 * Mantém compatível com seu uso atual: qs("#id")
 */
export function qs(selector, root = document) {
  try {
    return root.querySelector(selector);
  } catch (_) {
    return null;
  }
}

/**
 * QuerySelectorAll com root opcional (default: document).
 * Mantém compatível com seu uso atual: qsa(".classe").forEach(...)
 */
export function qsa(selector, root = document) {
  try {
    return root.querySelectorAll(selector);
  } catch (_) {
    // Retorna um NodeList vazio compatível com forEach
    return document.querySelectorAll("__dl__never__match__");
  }
}

/**
 * Define tema no <html data-theme="light|dark"> e persiste no localStorage.
 */
export function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.setAttribute("data-theme", t);

  try {
    localStorage.setItem("dl:theme", t);
  } catch (_) {
    // ignora (modo privado / storage bloqueado)
  }
}