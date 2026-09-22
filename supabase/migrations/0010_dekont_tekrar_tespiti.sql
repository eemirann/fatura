-- Dekont tekrar-kullanım tespitini SHA-256 (birebir dosya) ve dHash
-- (kırpılmış/yeniden sıkıştırılmış ama aynı görsel) ile genişletir.
-- Supabase SQL Editor'e olduğu gibi yapıştırıp çalıştırın.

alter table receipts add column if not exists dosya_sha256 text;
alter table receipts add column if not exists okunan_gorsel_hash text;

-- Birebir aynı dosyanın başka bir fatura için tekrar yüklenmesini engeller
-- (bkz. app/api/ingest/route.ts). Kısmi indeks: hesaplanamadığında (null)
-- kısıtlamaz.
create unique index if not exists receipts_dosya_sha256_unique
  on receipts (dosya_sha256)
  where dosya_sha256 is not null;

-- dHash TEKİL olması gereken bir alan değil (Hamming mesafesiyle bulanık
-- karşılaştırılıyor, uygulama kodunda) — yalnızca sorguyu hızlandırmak için
-- düz bir indeks.
create index if not exists receipts_gorsel_hash_idx
  on receipts (okunan_gorsel_hash)
  where okunan_gorsel_hash is not null;
