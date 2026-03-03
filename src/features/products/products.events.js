// src/features/products/products.events.js
import { cloudPushDebounced } from "../cloud/cloud.sync.js";
import { persist, subscribe } from "../../core/store.js";
import { renderProducts } from "./products.ui.js";

export function bindProductsFeature() {
  // re-render quando state muda (simples)
  subscribe(() => {
    renderProducts();
  });

  // placeholder: aqui entram seus addEventListener reais depois
}

export function persistAndSync() {
  persist();
  cloudPushDebounced();
}