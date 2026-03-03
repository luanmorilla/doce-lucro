// src/features/cloud/cloud.sync.js
import { supabase } from "../../supabase.js";
import { getState, setState, persist } from "../../core/store.js";

let session = null;
let cloudUserId = null;
let isApplyingCloud = false;
let cloudSaveTimer = null;

export function getUserId() {
  return session?.user?.id || cloudUserId || null;
}

export async function refreshSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data?.session || null;
    cloudUserId = session?.user?.id || null;
  } catch {
    session = null;
    cloudUserId = null;
  }
}

export async function cloudPull(normalizeStateFn) {
  const uid = getUserId();
  if (!uid) return false;

  try {
    const { data, error } = await supabase
      .from("user_state")
      .select("state")
      .eq("user_id", uid)
      .maybeSingle();

    if (error) throw error;

    if (data?.state && Object.keys(data.state).length) {
      isApplyingCloud = true;

      const next = normalizeStateFn ? normalizeStateFn(data.state) : data.state;
      setState(next);
      persist();

      isApplyingCloud = false;
      return true;
    }

    return false;
  } catch (e) {
    console.warn("cloudPull failed:", e?.message || e);
    isApplyingCloud = false;
    return false;
  }
}

export async function cloudPushNow() {
  const uid = getUserId();
  if (!uid) return;

  try {
    const payload = {
      user_id: uid,
      state: getState(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_state").upsert(payload);
    if (error) throw error;
  } catch (e) {
    console.warn("cloudPush failed:", e?.message || e);
  }
}

export function cloudPushDebounced() {
  if (isApplyingCloud) return;
  if (!getUserId()) return;

  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    cloudPushNow();
  }, 600);
}

export function bindAuthEvents({ onLogin } = {}) {
  supabase.auth.onAuthStateChange(async (_event, _session) => {
    session = _session;
    cloudUserId = _session?.user?.id || null;
    if (cloudUserId && onLogin) await onLogin();
  });
}