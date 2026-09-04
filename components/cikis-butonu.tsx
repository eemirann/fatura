"use client";

import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function CikisButonu() {
  const router = useRouter();

  async function cik() {
    await getBrowserSupabase().auth.signOut();
    router.replace("/giris");
    router.refresh();
  }

  return (
    <button
      onClick={cik}
      className="rounded-lg px-3 py-2.5 sm:py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      Çıkış
    </button>
  );
}
