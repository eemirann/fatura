import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Oturum çerezini tazeler ve panel sayfalarını korur.
 *
 * Herkese açık kalanlar:
 *   /giris     — giriş formu
 *   /y/*       — kiracının dekont yükleme sayfası (yetki token'ın kendisidir)
 *   /api/ingest— dekont girişi (token ya da X-Ingest-Key ile kendi doğrulamasını yapar)
 */
const ACIK_YOLLAR = ["/giris", "/y", "/api/ingest"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() çerezi de tazeler — bu çağrı kaldırılmamalı.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const yol = request.nextUrl.pathname;
  const acik = ACIK_YOLLAR.some((p) => yol === p || yol.startsWith(p + "/"));

  if (!user && !acik) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("devam", yol);
    return NextResponse.redirect(url);
  }

  if (user && yol === "/giris") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
