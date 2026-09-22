-- IBAN eşleşmesi ve dekont tekrar-kullanım tespiti
-- Supabase SQL Editor'e olduğu gibi yapıştırıp çalıştırın.

alter type receipt_eslesme add value if not exists 'iban_uyusmadi';
alter type receipt_eslesme add value if not exists 'tekrar_kullanilmis';

alter table receipts add column if not exists okunan_referans_no text;

-- Bankanın işlem/referans numarası tüm dekontlar genelinde tekil olmalı —
-- aynı dekontun başka bir fatura için tekrar yüklenmesini engeller (bkz.
-- app/api/ingest/route.ts). Kısmi indeks: numara okunamadığında (null) hiç
-- kısıtlamaz.
create unique index if not exists receipts_referans_no_unique
  on receipts (okunan_referans_no)
  where okunan_referans_no is not null;
