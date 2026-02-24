import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fxiaxmyiqzmmqixlkhen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ByvFyYzpUfJf1RppomWm4A_LmmBV3sR";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);