const KEY = "doce_lucro_state_v1";
const SCHEMA_VERSION = 2;

/* =========================================================
   STORAGE SAFE
   - evita quebrar em navegadores/privado
========================================================= */
function getSafeStorage() {
  try {
    const t = "__dl_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
}

const storage = getSafeStorage();

export function newId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  // fallback mais estável
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}

export function getDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,

    theme: "dark",
    route: "home",

    storeName: "",
    metaMensal: 3000,
    mesRef: monthKey(),

    products: [],
    sales: [],
    orders: [],
    cashMoves: [],

    ui: {
      saleCart: {},
      salePay: "pix",
      saleDiscount: 0,
      saleExtra: 0,
      saleReceived: 0,

      // rascunhos
      orderDraftItems: {},
      orderDraftForm: {},

      // rascunho da saída (mesmo que hoje você use modal direto, isso não quebra nada)
      cashOutDraft: {
        tipoMov: "despesa", // "despesa" | "retirada"
        valor: 0,
        descricao: "",
        categoria: "ingredientes",
        metodo: "dinheiro",
        data: "",
      },
    },

    auth: {
      mode: "supabase", // "supabase" | "pin"
      enabled: false,
      pin: "",
      unlocked: true,
    },
  };
}

export function loadState() {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

/* =========================================================
   MIGRATIONS
   - garante compatibilidade conforme o app evolui
========================================================= */
function migrateState(s) {
  const base = getDefaultState();
  const input = s && typeof s === "object" ? s : {};

  let v = Number(input.schemaVersion || 0);

  // Merge base primeiro (pra nunca faltar campos)
  let out = {
    ...base,
    ...input,
    ui: { ...base.ui, ...(input.ui || {}) },
    auth: { ...base.auth, ...(input.auth || {}) },
  };

  // v0/v1 -> v2: garante campos que seu app usa hoje
  if (v < 2) {
    if (!out.mesRef) out.mesRef = monthKey();

    // garantir ui
    out.ui.saleCart = out.ui.saleCart && typeof out.ui.saleCart === "object" ? out.ui.saleCart : {};
    out.ui.orderDraftItems =
      out.ui.orderDraftItems && typeof out.ui.orderDraftItems === "object" ? out.ui.orderDraftItems : {};
    out.ui.orderDraftForm =
      out.ui.orderDraftForm && typeof out.ui.orderDraftForm === "object" ? out.ui.orderDraftForm : {};

    // arrays
    out.products = Array.isArray(out.products) ? out.products : [];
    out.sales = Array.isArray(out.sales) ? out.sales : [];
    out.orders = Array.isArray(out.orders) ? out.orders : [];
    out.cashMoves = Array.isArray(out.cashMoves) ? out.cashMoves : [];

    // auth defaults
    out.auth.mode = out.auth.mode === "pin" ? "pin" : "supabase";
    out.auth.enabled = out.auth.enabled === true;
    out.auth.pin = typeof out.auth.pin === "string" ? out.auth.pin : "";
    out.auth.unlocked = out.auth.unlocked === true;

    // theme sanitize
    out.theme = out.theme === "light" ? "light" : "dark";
    out.route = out.route || "home";

    out.schemaVersion = 2;
    v = 2;
  }

  // sempre manter atualizado
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

/* =========================================================
   internal util
========================================================= */
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}