"use client";

import { useFormStatus } from "react-dom";

const STIL = {
  dolu: "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50",
  hat: "border border-slate-300 text-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent",
  tehlike: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
};

export default function GonderButonu({
  children,
  bekleyen,
  varyant = "dolu",
  disabled = false,
  className = "",
  title,
}: {
  children: React.ReactNode;
  bekleyen?: string;
  /** "dolu": birincil eylem (koyu dolgulu). "hat": ikincil eylem (çerçeveli). */
  varyant?: keyof typeof STIL;
  /** Örn. görüntüleyici rolünde — pending durumundan bağımsız dışarıdan kilitleme. */
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${STIL[varyant]} ${className}`}
    >
      {pending ? (bekleyen ?? "Kaydediliyor…") : children}
    </button>
  );
}
