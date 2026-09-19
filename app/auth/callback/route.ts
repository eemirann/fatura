import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server.ts";
import { siteUrl } from "@/lib/site-url.ts";

/** Supabase'in e-posta bağlantılarında gönderdiği doğrulama türleri. */
const GECERLI_TURLER: EmailOtpType[] = [
  "recovery",
  "invite",
  "signup",
  "magiclink",
  "email_change",
];

/**
 * Supabase'in davet/parola-sıfırlama e-postasındaki linkin döndüğü adres.
 * Oturumu kurup kullanıcıyı şifre belirleme sayfasına yönlendirir.
 *
 * İki akış destekleniyor:
 *   ?token_hash=...&type=recovery  → e-posta şablonundaki `{{ .TokenHash }}`
 *   ?code=...                      → PKCE (tarayıcıdan başlatılan akışlar)
 *
 * `token_hash` yolu şart: Supabase'in kendi `/auth/v1/verify` yönlendirmesi
 * sonucu adres FRAGMENT'ine (`#access_token=...` ya da `#error=...`) yazıyor,
 * fragment ise sunucuya hiç gönderilmiyor — bu yüzden buraya `code` gelmiyor,
 * kullanıcı da "Auth session missing!" görüyordu. `verifyOtp` ile doğrulamayı
 * kendimiz yapınca oturum çerezi sunucu tarafında kuruluyor.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tur = searchParams.get("type");

  // `origin` kullanılamaz: Caddy arkasında Next isteği kendi bağlandığı iç
  // adreste (0.0.0.0:3100) görüyor, kullanıcı oraya yönlendirilince sayfa
  // açılmıyordu. SITE_URL panelin gerçek genel adresi; yalnızca o tanımsızken
  // (yerel geliştirme) origin'e düşüyoruz.
  const taban = siteUrl() || origin;
  const supabase = await getServerSupabase();

  // Doğrulanamayan bağlantıda /davet'e göndermiyoruz: orada oturum aranır ve
  // kullanıcı ham bir hata görürdü. Sıfırlama/davet bağlantıları tek
  // kullanımlıktır — ikinci tıklama ya da süresi dolmuş bağlantı buraya düşer.
  if (tokenHash && tur && (GECERLI_TURLER as string[]).includes(tur)) {
    const { error } = await supabase.auth.verifyOtp({
      type: tur as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(`${taban}/giris?hata=baglanti-kullanilmis`);
    }
    return NextResponse.redirect(`${taban}/davet`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${taban}/giris?hata=baglanti-kullanilmis`);
    }
    return NextResponse.redirect(`${taban}/davet`);
  }

  return NextResponse.redirect(`${taban}/giris?hata=baglanti-gecersiz`);
}
