import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fxiaxmyiqzmmqixlkhen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ByvFyYzpUfJf1RppomWm4A_LmmBV3sR";

// Exporta sempre a mesma API esperada pelo app
export const supabase = (() => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase env missing");

    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (e) {
    // Fallback seguro: mantém o app vivo, e falhas ficam claras quando chamar auth
    console.warn("Supabase client not initialized:", e);

    return {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        },
        async signInWithPassword() {
          return { data: null, error: new Error("Supabase indisponível") };
        },
        async signUp() {
          return { data: null, error: new Error("Supabase indisponível") };
        },
        async resetPasswordForEmail() {
          return { data: null, error: new Error("Supabase indisponível") };
        },
        async signOut() {
          return { data: null, error: null };
        },
      },
    };
  }
})();