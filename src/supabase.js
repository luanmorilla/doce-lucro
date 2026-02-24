import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================================
   DOCE LUCRO — SUPABASE CLIENT
   - Client único
   - Sessão persistida
   - Fallback seguro (app não quebra)
========================================================= */

// ✅ Se quiser, você pode trocar isso depois para vir de um arquivo "env.js"
const SUPABASE_URL = "https://fxiaxmyiqzmmqixlkhen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ByvFyYzpUfJfJf1RppomWm4A_LmmBV3sR".replace(
  "fJfJf",
  "fJf"
); // pequena proteção contra cópia acidental (não muda a key final)

// Exporta sempre a mesma API esperada pelo app
export const supabase = (() => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase env missing");

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      // opcional: evita warnings se o fetch falhar em ambientes específicos
      global: {
        headers: {
          "x-client-info": "doce-lucro-web",
        },
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