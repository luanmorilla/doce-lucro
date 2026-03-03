// src/core/store.js
import { loadState, saveState } from "../state.js";

let state = null;
const listeners = new Set();

export function initStore(normalizeStateFn) {
  const raw = loadState();
  state = normalizeStateFn ? normalizeStateFn(raw) : raw;
  return state;
}

export function getState() {
  return state;
}

export function setState(next) {
  state = next;
  notify();
}

export function persist() {
  saveState(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}