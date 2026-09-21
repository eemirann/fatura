"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function CikisButonu() {
  const router = useRouter();
  const [cikiliyor, setCikiliyor] = useState(false);

  async function cik() {
    setCikiliyor(true);
    await getBrowserSupabase().auth.signOut();
    router.replace("/giris");
    router.refresh();
  }

  return (
    <button
      onClick={cik}
      disabled={cikiliyor}
      className="rounded-lg px-3 py-2.5 sm:py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {cikiliyor ? "Çıkış yapılıyor…" : "Çıkış"}
    </button>
  );
}
