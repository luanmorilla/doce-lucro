/* =========================================================
   DOCE LUCRO — UI CORE (PRO)
========================================================= */

/* =========================================================
   SELECTORS
========================================================= */
export const qs = (sel, root = document) => root?.querySelector?.(sel) || null;
export const qsa = (sel, root = document) =>
  root?.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];

/* =========================================================
   FORMATTERS
========================================================= */

// ✅ Formatação monetária robusta (não quebra com lixo)
export function brl(v) {
  if (typeof v === "string") {
    v = v
      .trim()
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=.*\.)/g, "") // remove pontos extras
      .replace(",", ".");
  }

  const n = Number(v || 0);
  const safe = Number.isFinite(n) ? n : 0;

  return safe.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// Número simples com 2 casas
export function number2(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/* =========================================================
   THEME
========================================================= */

export function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;

  // Ajusta cor da barra do navegador (mobile)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", t === "light" ? "#f6f7fb" : "#070A14");
  }

  // Pequeno feedback visual
  document.documentElement.classList.add("theme-transition");
  setTimeout(() => {
    document.documentElement.classList.remove("theme-transition");
  }, 200);
}

/* =========================================================
   BRAND
========================================================= */

export function setBrand(name) {
  const finalName = name?.trim() || "Doce Lucro";

  const el = qs("#brandName");
  if (el) el.textContent = finalName;

  const el2 = qs("#brandSub");
  if (el2) el2.textContent = "Lucro real em segundos";

  // Atualiza título da aba (experiência SaaS)
  document.title = `${finalName} • Doce Lucro`;
}

/* =========================================================
   UX HELPERS
========================================================= */

// Vibração leve em mobile (se suportado)
export function haptic(ms = 15) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

// Scroll suave seguro
export function smoothScrollTop() {
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
}

// Foco seguro
export function safeFocus(el) {
  try {
    el?.focus?.();
  } catch {}
}