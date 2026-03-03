import { loadState, saveState, getDefaultState } from "../state.js";

/**
 * Store central
 * - state em memória
 * - normalizeState (1 fonte da verdade)
 * - persist (local + cloud hook)
 */

let state = normalizeState(loadState());

let cloudSaveHook = null; // função que o cloud registra pra salvar (debounce)

export function getState() {
  return state;
}

export function setState(next) {
  state = normalizeState(next);
}

export function setCloudSaveHook(fn) {
  cloudSaveHook = typeof fn === "function" ? fn : null;
}

export function normalizeState(s) {
  const base = getDefaultState();
  const merged = {
    ...base,
    ...(s || {}),
    ui: { ...base.ui, ...((s && s.ui) || {}) },
    auth: { ...base.auth, ...((s && s.auth) || {}) },
  };

  merged.products = Array.isArray(merged.products) ? merged.products : [];
  merged.sales = Array.isArray(merged.sales) ? merged.sales : [];
  merged.orders = Array.isArray(merged.orders) ? merged.orders : [];
  merged.cashMoves = Array.isArray(merged.cashMoves) ? merged.cashMoves : [];

  merged.ui.saleCart = merged.ui.saleCart && typeof merged.ui.saleCart === "object" ? merged.ui.saleCart : {};

  merged.ui.orderDraftItems =
    merged.ui.orderDraftItems && typeof merged.ui.orderDraftItems === "object" ? merged.ui.orderDraftItems : {};
  merged.ui.orderDraftForm =
    merged.ui.orderDraftForm && typeof merged.ui.orderDraftForm === "object" ? merged.ui.orderDraftForm : {};

  merged.theme = merged.theme === "light" ? "light" : "dark";
  merged.route = merged.route || "home";
  merged.metaMensal = Number.isFinite(Number(merged.metaMensal)) ? Number(merged.metaMensal) : 3000;
  merged.mesRef = merged.mesRef || monthKey();

  merged.ui.salePay = merged.ui.salePay || "pix";
  merged.ui.saleDiscount = Number(merged.ui.saleDiscount || 0);
  merged.ui.saleExtra = Number(merged.ui.saleExtra || 0);
  merged.ui.saleReceived = Number(merged.ui.saleReceived || 0);

  merged.storeName = typeof merged.storeName === "string" ? merged.storeName : "";

  merged.auth.mode = merged.auth.mode === "pin" ? "pin" : "supabase";
  merged.auth.enabled = merged.auth.enabled === true;
  merged.auth.pin = typeof merged.auth.pin === "string" ? merged.auth.pin : "";
  merged.auth.unlocked = merged.auth.unlocked === true;

  merged.orders = (merged.orders || []).map((o) => {
    const total = Number(o?.total || 0);
    const sinal = Number(o?.sinal || 0);
    return {
      ...o,
      total,
      sinal,
      createdAt: o?.createdAt || new Date().toISOString(),
      status: o?.status || "aberta",
      metodoSinal: o?.metodoSinal || "pix",
      metodoRestante: o?.metodoRestante || "pix",
      sinalRegistrado: o?.sinalRegistrado === true,
      entregaRegistrada: o?.entregaRegistrada === true,
    };
  });

  if (!merged.__updatedAt) merged.__updatedAt = new Date().toISOString();
  return merged;
}

export function stampLocalUpdatedAt() {
  try {
    state.__updatedAt = new Date().toISOString();
  } catch {}
}

export function persist() {
  state = normalizeState(state);

  // carimba local
  stampLocalUpdatedAt();

  // local sempre
  saveState(state);

  // cloud (se hook estiver ligado)
  if (cloudSaveHook) cloudSaveHook(state);
}

/* util local (mantém compatibilidade com seu normalize) */
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}