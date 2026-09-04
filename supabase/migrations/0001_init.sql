-- Kira Fatura Takip Paneli — ilk şema
-- Supabase SQL Editor'e olduğu gibi yapıştırıp çalıştırın.

-- ---------------------------------------------------------------- enum tipleri
do $$ begin
  create type invoice_durum as enum ('taslak', 'gonderildi', 'odendi', 'uyusmadi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type receipt_kaynak as enum ('kiraci_link', 'panel', 'api');
exception when duplicate_object then null; end $$;

do $$ begin
  create type receipt_eslesme as enum ('matched', 'mismatch', 'unreadable');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------- ayarlar
-- id kolonu daima true — tabloda tek satır olmasını garanti eder.
create table if not exists settings (
  id                        boolean primary key default true check (id),
  iban                      text not null default '',
  hesap_sahibi              text not null default '',
  varsayilan_son_odeme_gunu int  not null default 10
                              check (varsayilan_son_odeme_gunu between 1 and 28),
  mesaj_sablonu             text not null default
'Merhaba {kiraci_adi},

{donem} dönemi fatura bilgileriniz:
{kalemler}
Toplam: {toplam}
Son ödeme tarihi: {son_odeme_tarihi}

IBAN: {iban}
Ad Soyad: {hesap_sahibi}

Ödemenizin ardından dekontu bu sohbete fotoğraf veya PDF olarak
gönderebilir, ya da şu adresten yükleyebilirsiniz:
{dekont_linki}

Teşekkürler.',
  updated_at                timestamptz not null default now()
);

insert into settings (id) values (true) on conflict (id) do nothing;

-- ----------------------------------------------------------------------- bloklar
create table if not exists blocks (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null,
  sira       int  not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------ daireler
create table if not exists units (
  id             uuid primary key default gen_random_uuid(),
  block_id       uuid not null references blocks(id) on delete cascade,
  kapi_no        text not null,
  kiraci_adi     text,
  kiraci_telefon text,
  notlar         text,
  aktif          boolean not null default true,
  sira           int not null default 0,
  created_at     timestamptz not null default now(),
  unique (block_id, kapi_no)
);

create index if not exists units_block_idx on units (block_id);

-- ----------------------------------------------------------------------- faturalar
-- donem: ilgili ayın 1'i (2026-08-01 = Ağustos 2026 dönemi)
create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references units(id) on delete cascade,
  donem            date not null,
  son_odeme_tarihi date not null,
  toplam           numeric(12,2) not null default 0,
  durum            invoice_durum not null default 'taslak',
  public_token     uuid not null default gen_random_uuid(),
  gonderildi_at    timestamptz,
  incelendi_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (unit_id, donem),
  unique (public_token),
  constraint donem_ayin_ilki check (date_trunc('month', donem)::date = donem)
);

create index if not exists invoices_donem_idx on invoices (donem);

-- --------------------------------------------------------------- fatura kalemleri
create table if not exists invoice_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  baslik     text not null,
  tutar      numeric(12,2) not null check (tutar >= 0),
  sira       int not null default 0
);

create index if not exists invoice_items_invoice_idx on invoice_items (invoice_id);

-- ------------------------------------------------------------------------ dekontlar
create table if not exists receipts (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references invoices(id) on delete cascade,
  dosya_yolu      text not null,
  dosya_adi       text,
  mime            text not null,
  boyut           int,
  kaynak          receipt_kaynak not null,
  eslesme         receipt_eslesme not null,
  okunan_tutar    numeric(12,2),
  okunan_tarih    date,
  okunan_iban     text,
  okunan_alici    text,
  okunan_gonderen text,
  okunan_banka    text,
  aciklama        text,
  ham_json        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists receipts_invoice_idx on receipts (invoice_id, created_at desc);

-- ------------------------------------- fatura toplamını kalemlerden otomatik hesapla
-- Tek doğruluk kaynağı invoice_items; invoices.toplam her zaman ondan türer.
create or replace function sync_invoice_toplam() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invoice uuid;
begin
  v_invoice := coalesce(new.invoice_id, old.invoice_id);
  update invoices
     set toplam     = coalesce((select sum(tutar) from invoice_items
                                 where invoice_id = v_invoice), 0),
         updated_at = now()
   where id = v_invoice;
  return null;
end $$;

drop trigger if exists trg_invoice_items_toplam on invoice_items;
create trigger trg_invoice_items_toplam
after insert or update or delete on invoice_items
for each row execute function sync_invoice_toplam();

-- ----------------------------------------------------------------------------- RLS
-- Panel tabloları yalnızca giriş yapmış kullanıcıya açık.
-- Kiracı yükleme akışı (token ile, oturumsuz) sunucu tarafında service_role ile
-- çalışır; service_role RLS'i baypas ettiği için anon'a hiçbir yetki verilmez.
alter table settings      enable row level security;
alter table blocks        enable row level security;
alter table units         enable row level security;
alter table invoices      enable row level security;
alter table invoice_items enable row level security;
alter table receipts      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','blocks','units','invoices','invoice_items','receipts'] loop
    execute format('drop policy if exists "panel_tam_yetki" on %I', t);
    execute format(
      'create policy "panel_tam_yetki" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------- storage
-- Dekont dosyaları. Private bucket: yalnızca imzalı URL ile görüntülenir.
insert into storage.buckets (id, name, public, file_size_limit)
values ('dekontlar', 'dekontlar', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "dekont_oku" on storage.objects;
create policy "dekont_oku" on storage.objects
  for select to authenticated using (bucket_id = 'dekontlar');
