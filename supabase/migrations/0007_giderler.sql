-- Apartman giderleri ve kasa.
--
-- Panel bugüne kadar yalnızca TAHSİLAT tarafını biliyordu. Oysa apartman
-- yöneticisinin işinin yarısı gider tarafı: kapıcı maaşı, asansör bakımı,
-- yakıt, temizlik, elektrik. Bunlar girilemediği için yönetici giderleri yine
-- Excel'de tutuyor, dolayısıyla "kasada ne kadar var?" sorusunun cevabı
-- panelde yoktu — oysa Kat Mülkiyeti Kanunu gereği yönetici kat maliklerine
-- hesap vermek zorunda.
--
-- Kasa bakiyesi burada SAKLANMIYOR, tahsilat ve giderlerden türetiliyor
-- (bkz. lib/kasa.ts). Aynı gerekçe borç hesabındaki gibi: saklanan bir
-- bakiye, elle düzeltmeler sonrasında gerçekle arasını açar.

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  tarih       date not null,
  baslik      text not null,
  tutar       numeric(12,2) not null check (tutar > 0),
  -- Serbest metin değil sabit liste: yıl sonu raporunda "Elektrik" ile
  -- "elektrik" ayrı kalemler gibi görünmesin.
  kategori    text not null default 'diger'
              check (kategori in ('personel','elektrik','su','dogalgaz','yakit',
                                  'bakim','temizlik','tamirat','vergi','diger')),
  aciklama    text,
  created_at  timestamptz not null default now(),
  -- Kullanıcı silinse bile gider kaydı kalmalı.
  created_by  uuid references auth.users(id) on delete set null
);

-- Tipik sorgu "şu dönemin giderleri" ve "en son ne harcandı".
create index if not exists expenses_tarih_idx on expenses (tarih desc);

alter table expenses enable row level security;

-- Panel tablolarıyla aynı kalıp: okuma her iki role açık (denetçi de
-- görmeli), yazma yalnızca yöneticide.
drop policy if exists "panel_okuma" on expenses;
drop policy if exists "panel_ekleme" on expenses;
drop policy if exists "panel_guncelleme" on expenses;
drop policy if exists "panel_silme" on expenses;

create policy "panel_okuma" on expenses
  for select to authenticated using (true);
create policy "panel_ekleme" on expenses
  for insert to authenticated with check (is_yonetici());
create policy "panel_guncelleme" on expenses
  for update to authenticated using (is_yonetici()) with check (is_yonetici());
create policy "panel_silme" on expenses
  for delete to authenticated using (is_yonetici());
