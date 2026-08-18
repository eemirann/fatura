"use client";

import { useFormStatus } from "react-dom";

export default function GonderButonu({
  children,
  bekleyen,
  className = "",
}: {
  children: React.ReactNode;
  bekleyen?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 " +
        className
      }
    >
      {pending ? (bekleyen ?? "Kaydediliyor…") : children}
    </button>
  );
}
