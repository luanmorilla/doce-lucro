import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================================
   DOCE LUCRO — SUPABASE CLIENT (PRO)
   - Client único
   - Sessão persistida com storageKey fixo
   - Fallback seguro (app não quebra)
   - Pronto pra SaaS (multi-device)
========================================================= */

const SUPABASE_URL = "https://fxiaxmyiqzmmqixlkhen.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4aWF4bXlpcXptbXFpeGxraGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODc5MzMsImV4cCI6MjA4NzQ2MzkzM30.BWWKiZfAdlDuVOTJJV8B17YJyhpjEIj0E_EHobfZdmI";

// ✅ Storage robusto (alguns navegadores / modos privativos podem falhar)
function getSafeStorage() {
  try {
    const t = "__dl_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    // fallback em memória (sessão não persiste entre reloads)
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
}

// Exporta sempre a mesma API esperada pelo app
export const supabase = (() => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase env missing");

    const storage = getSafeStorage();

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,

        // ✅ Importante: chave fixa evita conflitos com outros projetos no mesmo domínio
        storageKey: "doce-lucro-auth-v1",
        storage,

        // ✅ Para email/senha padrão NÃO precisa (só para OAuth/magiclink)
        // Se no futuro você usar magic link/OAuth, a gente liga isso de volta.
        detectSessionInUrl: false,
      },
      global: {
        headers: { "x-client-info": "doce-lucro-web" },
      },
    });

    return client;
  } catch (e) {
    console.warn("Supabase client not initialized:", e);

    // ✅ Fallback seguro: mantém o app vivo, mas deixa claro quando tentar usar auth
    const fallbackError = () => new Error("Supabase indisponível (client não inicializado)");

    return {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async signInWithPassword() {
          return { data: null, error: fallbackError() };
        },
        async signUp() {
          return { data: null, error: fallbackError() };
        },
        async resetPasswordForEmail() {
          return { data: null, error: fallbackError() };
        },
        async signOut() {
          return { data: null, error: null };
        },
      },
    };
  }
})();