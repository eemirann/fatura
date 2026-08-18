const TR_AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** 1650 -> "1.650,00 ₺" */
export function para(tutar: number | null | undefined): string {
  const n = Number(tutar ?? 0);
  return (
    n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺"
  );
}

/** "2026-08-01" -> "Ağustos 2026" */
export function donemEtiketi(donem: string): string {
  const [yil, ay] = donem.split("-").map(Number);
  return `${TR_AYLAR[ay - 1]} ${yil}`;
}

/** "2026-08-10" -> "10.08.2026" */
export function tarihTR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, a, g] = iso.slice(0, 10).split("-");
  return `${g}.${a}.${y}`;
}

/** Tarayıcı saat diliminden bağımsız "YYYY-MM-DD". */
export function isoGun(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Verilen tarihin ait olduğu ayın 1'i — dönem anahtarı. */
export function donemAnahtari(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Dönemi ay bazında kaydırır: ("2026-08-01", -1) -> "2026-07-01" */
export function donemKaydir(donem: string, aySayisi: number): string {
  const [yil, ay] = donem.split("-").map(Number);
  const d = new Date(yil, ay - 1 + aySayisi, 1);
  return donemAnahtari(d);
}

/**
 * Dönem + ayın günü -> son ödeme tarihi.
 * Kısa aylarda taşmayı önler (Şubat + 30 -> ayın son günü).
 */
export function sonOdemeTarihi(donem: string, gun: number): string {
  const [yil, ay] = donem.split("-").map(Number);
  const ayinSonGunu = new Date(yil, ay, 0).getDate();
  return `${yil}-${String(ay).padStart(2, "0")}-${String(
    Math.min(gun, ayinSonGunu),
  ).padStart(2, "0")}`;
}

/** Telefonu wa.me biçimine çevirir: "0532 111 22 33" -> "905321112233" */
export function waTelefon(telefon: string | null | undefined): string | null {
  if (!telefon) return null;
  let d = telefon.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  // 10 haneli yerel numara (5XXXXXXXXX) ise Türkiye kodunu ekle
  if (d.length === 10) d = "90" + d;
  return d.length >= 11 ? d : null;
}
