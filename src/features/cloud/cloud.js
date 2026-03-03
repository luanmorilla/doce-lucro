import { supabase } from "../../supabase.js";
import { getState, setState, persist, normalizeState, setCloudSaveHook } from "../../core/store.js";
import { setTheme, setBrand, qs } from "../../ui.js";

/**
 * Cloud Sync do Doce Lucro
 * - Corrige bug: NÃO pode dar upsert com state local antes de ler o cloud
 * - Merge por __updatedAt
 * - Debounce save + hash estável (evita loop)
 */

let session = null;
let cloudUserId = null;
let isApplyingCloud = false;
let saveTimer = null;
let lastSavedHash = "";

/* =============================
   HASH / UPDATEDAT / MERGE
============================= */

function stableHash(obj) {
  try {
    const seen = new WeakSet();
    const s = JSON.stringify(obj, function (k, v) {
      if (v && typeof v === "object") {
        if (seen.has(v)) return;
        seen.add(v);
        if (!Array.isArray(v)) {
          const out = {};
          Object.keys(v)
            .sort()
            .forEach((kk) => (out[kk] = v[kk]));
          return out;
        }
      }
      return v;
    });

    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  } catch {
    return String(Date.now());
  }
}

function getLocalUpdatedAt(s) {
  try {
    const t = s?.__updatedAt;
    const ms = t ? new Date(t).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

function mergePreferNewer(localState, cloudState) {
  const local = normalizeState(localState);
  const cloud = normalizeState(cloudState);

  const lt = getLocalUpdatedAt(local);
  const ct = getLocalUpdatedAt(cloud);

  return ct > lt ? cloud : local;
}

/* =============================
   SESSION
============================= */

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

async function getUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

/* =============================
   CLOUD READ (SEM SOBRESCREVER)
============================= */

async function ensureCloudRowIfMissing(userId) {
  if (!userId) return;

  // ✅ INSERE só se não existir (não sobrescreve)
  // Supabase: insert + onConflict + ignoreDuplicates
  try {
    await supabase.from("user_state").insert(
      {
        user_id: userId,
        data: normalizeState(getState()),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  } catch {
    // silencioso
  }
}

export async function loadStateFromCloud() {
  const u = await getUser();
  if (!u) return { state: getState(), hasCloud: false };

  cloudUserId = u.id;

  // cria linha se não existir, sem sobrescrever
  await ensureCloudRowIfMissing(u.id);

  try {
    const { data, error } = await supabase
      .from("user_state")
      .select("data, updated_at")
      .eq("user_id", u.id)
      .maybeSingle();

    if (error) {
      console.warn("Erro ao carregar cloud state:", error);
      return { state: getState(), hasCloud: false };
    }

    const cloudState = data?.data ?? null;
    if (!cloudState) return { state: getState(), hasCloud: false };

    const merged = mergePreferNewer(getState(), cloudState);

    // NÃO carimba aqui (evita loop). Só seta hash.
    lastSavedHash = stableHash(normalizeState(merged));
    return { state: merged, hasCloud: true };
  } catch (e) {
    console.warn("Erro inesperado ao carregar cloud state:", e);
    return { state: getState(), hasCloud: false };
  }
}

export async function applyCloudAfterLogin({ syncThemeIcon } = {}) {
  isApplyingCloud = true;
  try {
    const loaded = await loadStateFromCloud();
    setState(loaded.state);

    // mantém local igual ao merge
    persist();

    // aplica UI
    const s = getState();
    setTheme(s.theme || "dark");
    setBrand(s.storeName || "");
    const btnTheme = qs("#btnTheme");
    if (syncThemeIcon) syncThemeIcon(btnTheme);
  } catch (e) {
    console.warn("Erro no applyCloudAfterLogin:", e);
  } finally {
    isApplyingCloud = false;
  }
}

/* =============================
   CLOUD SAVE (DEBOUNCE + HASH)
============================= */

function scheduleSaveToCloud(currentState, debounceMs = 700) {
  if (!cloudUserId) return;
  if (isApplyingCloud) return;

  const base = normalizeState(currentState);
  const baseHash = stableHash(base);
  if (baseHash === lastSavedHash) return;

  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    try {
      const normalized = normalizeState(currentState);
      // quem carimba __updatedAt é o persist do store (local)
      const { error } = await supabase.from("user_state").upsert(
        {
          user_id: cloudUserId,
          data: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.warn("Erro ao salvar cloud state:", error);
        return;
      }

      lastSavedHash = stableHash(normalized);
    } catch (e) {
      console.warn("Erro inesperado ao salvar cloud state:", e);
    }
  }, debounceMs);
}

export function bindCloudSaveHook() {
  // store.persist() vai chamar isso automaticamente quando houver login
  setCloudSaveHook((s) => scheduleSaveToCloud(s, 700));
}

export function unbindCloudSaveHook() {
  setCloudSaveHook(null);
}

/* =============================
   AUTH FLOW HELPERS
============================= */

export function bindAuthListener({ onLoggedIn, onLoggedOut } = {}) {
  supabase.auth.onAuthStateChange(async (_event, sess) => {
    session = sess || null;
    cloudUserId = session?.user?.id || null;

    if (session?.user) {
      bindCloudSaveHook();
      if (onLoggedIn) await onLoggedIn();
      return;
    }

    unbindCloudSaveHook();
    if (onLoggedOut) await onLoggedOut();
  });
}