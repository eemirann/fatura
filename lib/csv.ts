/**
 * CSV üretiminin saf yardımcıları. Route'tan ayrı tutuluyor ki testler
 * (tests/csv.test.ts) Next/Supabase bağımlılıklarını yüklemeden import
 * edebilsin — lib/esles.ts ve lib/durum.ts ile aynı kalıp.
 */

/**
 * Excel/Sheets, hücre "=", "+", "-" ya da "@" ile başlıyorsa içeriği formül
 * olarak çalıştırır ("CSV injection"). Blok adı ve kiracı adı kullanıcı
 * girdisi olduğu için (bkz. app/bloklar/actions.ts) başa tek tırnak koyup
 * hücreyi metne sabitliyoruz; tırnak görüntüde çıkmaz.
 */
const FORMUL_BASLANGICI = /^[=+\-@]/;

/** CSV alanını gerekirse tırnak içine alır (virgül/tırnak/satır sonu varsa). */
export function csvAlan(deger: unknown): string {
  let s = deger === null || deger === undefined ? "" : String(deger);
  if (FORMUL_BASLANGICI.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
