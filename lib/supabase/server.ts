import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Sunucu bileşenleri ve route handler'ları için Supabase istemcisi.
 * Kullanıcının oturum çerezini taşır, dolayısıyla RLS altında çalışır.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Sunucu bileşeninden çağrıldığında çerez yazılamaz;
            // oturum yenilemeyi middleware zaten yapıyor.
          }
        },
      },
    },
  );
}

/** Oturum yoksa null döner. Sayfa korumasını middleware yapar. */
export async function getUser() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
