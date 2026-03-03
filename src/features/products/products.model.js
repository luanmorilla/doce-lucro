// src/features/products/products.model.js
import { getState, setState } from "../../core/store.js";

export function ensureProductsShape() {
  const s = getState();
  if (!s.products) {
    s.products = [];
    setState(s);
  }
  return s.products;
}

// exemplos de funções (a gente vai adaptar depois pro seu state real)
export function addProduct(product) {
  const s = getState();
  s.products = s.products || [];
  s.products.unshift(product);
  setState(s);
}

export function updateProduct(id, patch) {
  const s = getState();
  const idx = (s.products || []).findIndex((p) => p.id === id);
  if (idx >= 0) {
    s.products[idx] = { ...s.products[idx], ...patch };
    setState(s);
  }
}

export function removeProduct(id) {
  const s = getState();
  s.products = (s.products || []).filter((p) => p.id !== id);
  setState(s);
}