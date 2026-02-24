const KEY = "doce_lucro_state_v1";

export function newId() {
  try {
    // evita ReferenceError se crypto não existir
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getDefaultState() {
  return {
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
      orderDraftItems: {},
    },

    // ✅ Auth
    auth: {
      // supabase session state (não salva o token aqui)
      mode: "supabase", // "supabase" | "pin"
      // PIN (opcional)
      enabled: false,
      pin: "",
      unlocked: true,
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    const raw = JSON.stringify(state);
    localStorage.setItem(KEY, raw);
  } catch {}
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}