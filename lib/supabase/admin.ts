import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_role istemcisi — RLS'i baypas eder.
 *
 * SADECE oturumsuz akışlarda kullanılır: kiracının token'lı dekont yüklemesi ve
 * ileride n8n'in /api/ingest çağrısı. Bu modül "server-only" ile işaretli
 * olduğu için yanlışlıkla bir istemci bileşenine import edilirse derleme hatası
 * verir; anahtar hiçbir koşulda tarayıcıya gitmez.
 */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY tanımlı değil.");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
