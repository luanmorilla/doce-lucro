/* =========================================================
   STATE MANAGEMENT (Doce Lucro)
========================================================= */

const STORAGE_KEY = "dl:state";
const SCHEMA_VERSION = 1;

/**
 * Retorna "YYYY-MM" usando data LOCAL (não UTC).
 * Evita bug de mês errado por toISOString().
 */
function monthKeyLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Garante que o valor é um número válido, senão usa fallback.
 */
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Garante que é array.
 */
function toArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Garante que é objeto simples.
 */
function toObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * Normaliza e corrige o estado carregado (compatibilidade/migração).
 */
function normalizeState(raw) {
  const base = getDefaultState();
  const s = toObject(raw);

  // Mescla base -> s (com prioridade do s)
  const merged = {
    ...base,
    ...s,
    ui: {
      ...base.ui,
      ...toObject(s.ui),
    },
  };

  // Força tipos corretos (blindagem contra state quebrado)
  merged.theme = merged.theme === "light" ? "light" : "dark";
  merged.route = typeof merged.route === "string" && merged.route ? merged.route : "home";

  merged.metaMensal = toNumber(merged.metaMensal, base.metaMensal);
  merged.mesRef = typeof merged.mesRef === "string" && merged.mesRef.length >= 7
    ? merged.mesRef.slice(0, 7)
    : monthKeyLocal();

  merged.products = toArray(merged.products);
  merged.sales = toArray(merged.sales);
  merged.orders = toArray(merged.orders);
  merged.cashMoves = toArray(merged.cashMoves);

  merged.ui.saleCart = toObject(merged.ui.saleCart);
  merged.ui.salePay = (merged.ui.salePay === "pix" || merged.ui.salePay === "dinheiro" || merged.ui.salePay === "cartao")
    ? merged.ui.salePay
    : "pix";

  merged.ui.saleDiscount = toNumber(merged.ui.saleDiscount, 0);
  merged.ui.saleExtra = toNumber(merged.ui.saleExtra, 0);
  merged.ui.saleReceived = toNumber(merged.ui.saleReceived, 0);

  merged.ui.editingProductId = merged.ui.editingProductId ?? null;
  merged.ui.editingOrderId = merged.ui.editingOrderId ?? null;
  merged.ui.orderDraftItems = toObject(merged.ui.orderDraftItems);

  merged.schemaVersion = toNumber(merged.schemaVersion, SCHEMA_VERSION);

  return merged;
}

export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return normalizeState(parsed);
    }
  } catch (e) {
    console.error("Erro ao carregar estado:", e);
  }

  return getDefaultState();
}

export function saveState(state) {
  try {
    // Salva sempre normalizado (evita salvar lixo/NaN/tipos errados)
    const safe = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch (e) {
    console.error("Erro ao salvar estado:", e);
  }
}

export function getDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,

    theme: "dark",
    route: "home",

    // Configurações
    metaMensal: 3000,
    mesRef: monthKeyLocal(),

    // Dados
    products: [],
    sales: [],
    orders: [],
    cashMoves: [],

    // UI State
    ui: {
      saleCart: {},
      salePay: "pix",
      saleDiscount: 0,
      saleExtra: 0,
      saleReceived: 0,
      editingProductId: null,
      editingOrderId: null,
      orderDraftItems: {},
    },
  };
}

export function newId() {
  // ID curto, único o suficiente para esse app (sem dependências)
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}