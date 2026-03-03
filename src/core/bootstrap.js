// src/core/bootstrap.js
import { initStore } from "./store.js";
import { refreshSession, cloudPull, bindAuthEvents, getUserId } from "../features/cloud/cloud.sync.js";
import { bindProductsFeature } from "../features/products/products.events.js";

export async function bootstrap({ normalizeStateFn } = {}) {
  // 1) init store
  initStore(normalizeStateFn);

  // 2) bind features
  bindProductsFeature();

  // 3) auth + pull
  await refreshSession();
  if (getUserId()) {
    await cloudPull(normalizeStateFn);
  }

  // 4) quando logar, puxar
  bindAuthEvents({
    onLogin: async () => {
      await cloudPull(normalizeStateFn);
      // aqui depois a gente manda re-render global
    },
  });
}