"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { yoneticiDegilse } from "@/lib/supabase/rol";
import { denetimYaz } from "@/lib/denetim";

export type ActionSonuc = { hata?: string };

function metin(fd: FormData, ad: string): string {
  return String(fd.get(ad) ?? "").trim();
}

function bosOlabilir(fd: FormData, ad: string): string | null {
  const v = metin(fd, ad);
  return v.length ? v : null;
}

export async function blokEkle(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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

  // Adı silmeden önce alıyoruz; sonrasında kayıt yok olduğu için denetim
  // kaydında yalnızca bir UUID kalırdı.
  const { data: blok } = await supabase
    .from("blocks")
    .select("ad")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("blocks").delete().eq("id", id);
  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "blok_silindi",
    hedefTur: "block",
    hedefId: id,
    detay: { ad: blok?.ad ?? null },
  });

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}

export async function daireEkle(_prev: ActionSonuc, fd: FormData): Promise<ActionSonuc> {
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

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
  const yetkisiz = await yoneticiDegilse();
  if (yetkisiz) return yetkisiz;

  const id = metin(fd, "id");
  const supabase = await getServerSupabase();

  // Daire silmek tüm fatura ve dekont geçmişini de siler (cascade). Neyin
  // gittiğini silmeden önce kaydediyoruz — sonrasında geri dönüp bakılacak
  // hiçbir kayıt kalmıyor.
  const { data: daire } = await supabase
    .from("units")
    .select("kapi_no, kiraci_adi, block_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) return { hata: error.message };

  await denetimYaz({
    eylem: "daire_silindi",
    hedefTur: "unit",
    hedefId: id,
    detay: {
      kapi_no: daire?.kapi_no ?? null,
      kiraci_adi: daire?.kiraci_adi ?? null,
      block_id: daire?.block_id ?? null,
    },
  });

  revalidatePath("/bloklar");
  revalidatePath("/");
  return {};
}
