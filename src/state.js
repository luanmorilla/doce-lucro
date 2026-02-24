const KEY = "doce_lucro_state_v1";

export function newId() {
  return crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

      // ✅ NOVO: rascunho do formulário da encomenda (pra não apagar ao clicar + / -)
      orderDraftForm: {},
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
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}