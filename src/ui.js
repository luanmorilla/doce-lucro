/* =========================================================
   UI UTILITIES
========================================================= */

export function brl(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }
  
  export function qs(selector) {
    return document.querySelector(selector);
  }
  
  export function qsa(selector) {
    return document.querySelectorAll(selector);
  }
  
  export function setTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    try {
      localStorage.setItem("dl:theme", theme);
    } catch (_) {}
  }
  