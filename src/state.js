/* =========================================================
   STATE MANAGEMENT
========================================================= */

const STORAGE_KEY = "dl:state";

export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Erro ao carregar estado:", e);
  }

  return getDefaultState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Erro ao salvar estado:", e);
  }
}

export function getDefaultState() {
  return {
    theme: "dark",
    route: "home",

    // Configurações
    metaMensal: 3000,
    mesRef: new Date().toISOString().slice(0, 7),

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
      orderDraftItems: {}
    }
  };
}

export function newId() {
  return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
