import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server.ts";

/**
 * Supabase'in davet/parola-sıfırlama e-postasındaki linkin döndüğü adres.
 * "code"u oturuma çevirip kullanıcıyı şifre belirleme sayfasına yönlendirir.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await getServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/davet`);
}
