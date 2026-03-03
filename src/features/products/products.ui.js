// src/features/products/products.ui.js
import { getState } from "../../core/store.js";

export function renderProducts() {
  // placeholder: a gente liga no seu DOM real depois
  const s = getState();
  console.log("renderProducts():", s.products?.length || 0);
}