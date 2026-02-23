import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ COLE AQUI (Project URL e anon key)
const SUPABASE_URL = "https://fxiaxmyiqzmmqixlkhen.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4aWF4bXlpcXptbXFpeGxraGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODc5MzMsImV4cCI6MjA4NzQ2MzkzM30.BWWKiZfAdlDuVOTJJV8B17YJyhpjEIj0E_EHobfZdmI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);