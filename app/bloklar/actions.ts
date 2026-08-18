"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";

export type ActionSonuc = { hata?: string };

function metin(fd: FormData, ad: string): string {
  return String(fd.get(ad) ?? "").trim();
}

function bosOlabilir(fd: FormData, ad: string): string | null {
  const v = metin(fd, ad);
  return v.length ? v : null;
}

export async function blokEkle(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const ad = metin(fd, "ad");
  if (!ad) return { hata: "Blok adı boş olamaz." };

  const supabase = await getServerSupabase();
  const { count } = await supabase.from("blocks").select("id", { count: "exact", head: true });

  const { error } = await supabase.from("blocks").insert({ ad, sira: count ?? 0 });
  if (error) return { hata: error.message };

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}

export async function blokSil(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const id = metin(fd, "id");
  const supabase = await getServerSupabase();

  // Blok silmek daireleri ve tüm fatura geçmişini de siler (cascade).
  // Kaza olmasın diye içinde daire varsa engelliyoruz.
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("block_id", id);

  if (count && count > 0) {
    return { hata: "Bu blokta daireler var. Önce daireleri silin." };
  }

  const { error } = await supabase.from("blocks").delete().eq("id", id);
  if (error) return { hata: error.message };

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}

export async function daireEkle(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const block_id = metin(fd, "block_id");
  const kapi_no = metin(fd, "kapi_no");
  if (!kapi_no) return { hata: "Kapı no boş olamaz." };

  const supabase = await getServerSupabase();
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("block_id", block_id);

  const { error } = await supabase.from("units").insert({
    block_id,
    kapi_no,
    kiraci_adi: bosOlabilir(fd, "kiraci_adi"),
    kiraci_telefon: bosOlabilir(fd, "kiraci_telefon"),
    sira: count ?? 0,
  });

  if (error) {
    return {
      hata:
        error.code === "23505"
          ? `Bu blokta "${kapi_no}" kapı numaralı daire zaten var.`
          : error.message,
    };
  }

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}

export async function daireGuncelle(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const id = metin(fd, "id");
  const kapi_no = metin(fd, "kapi_no");
  if (!kapi_no) return { hata: "Kapı no boş olamaz." };

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("units")
    .update({
      kapi_no,
      kiraci_adi: bosOlabilir(fd, "kiraci_adi"),
      kiraci_telefon: bosOlabilir(fd, "kiraci_telefon"),
      notlar: bosOlabilir(fd, "notlar"),
      aktif: fd.get("aktif") === "on",
    })
    .eq("id", id);

  if (error) {
    return {
      hata:
        error.code === "23505"
          ? `Bu blokta "${kapi_no}" kapı numaralı başka bir daire var.`
          : error.message,
    };
  }

  revalidatePath("/bloklar");
  revalidatePath("/");
  revalidatePath(`/daire/${id}`);
  return {};
}

export async function daireSil(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const id = metin(fd, "id");
  const supabase = await getServerSupabase();

  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) return { hata: error.message };

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}
