"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function GirisFormu() {
  const router = useRouter();
  const params = useSearchParams();
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setBekliyor(true);

    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: eposta.trim(),
      password: sifre,
    });

    if (error) {
      setHata(
        error.message === "Invalid login credentials"
          ? "E-posta veya şifre hatalı."
          : error.message,
      );
      setBekliyor(false);
      return;
    }

    // Middleware'in tazelenen oturumu görmesi için tam yenileme yap.
    const devam = params.get("devam") || "/";
    router.replace(devam);
    router.refresh();
  }

  return (
    <form onSubmit={gonder} className="space-y-4">
      <div>
        <label htmlFor="eposta" className="mb-1 block text-sm font-medium">
          E-posta
        </label>
        <input
          id="eposta"
          type="email"
          required
          autoComplete="username"
          value={eposta}
          onChange={(e) => setEposta(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="sifre" className="mb-1 block text-sm font-medium">
          Şifre
        </label>
        <input
          id="sifre"
          type="password"
          required
          autoComplete="current-password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </div>

      {hata && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>
      )}

      <button
        type="submit"
        disabled={bekliyor}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {bekliyor ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
