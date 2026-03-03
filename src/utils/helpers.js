import { qs } from "../ui.js";

export function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text ?? "").replace(/[&<>"']/g, (m) => map[m]);
}

export function parseMoneyInput(value) {
  if (value === null || value === undefined) return 0;
  let str = String(value).trim();
  if (!str) return 0;

  str = str.replace(/[^\d.,-]/g, "");

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) str = str.replace(/\./g, "").replace(",", ".");
    else str = str.replace(/,/g, "");
  } else if (hasComma) {
    str = str.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

export function formatMoneyInput(value) {
  const num = Number(value || 0);
  return num.toFixed(2).replace(".", ",");
}

export function toast(message, type = "info") {
  let existing = qs(".dl-toast");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = `dl-toast dl-toast--${type} is-visible`;
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 200);
  }, 3000);
}