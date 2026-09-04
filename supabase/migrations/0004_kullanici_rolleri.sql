-- Kullanıcı rolleri: davetle eklenen ek hesaplar için "yönetici" (tam yetki)
-- ve "goruntuleyici" (salt okunur) ayrımı. Herkese açık kayıt YOK — hesaplar
-- yalnızca mevcut yöneticinin gönderdiği davetle oluşur (bkz. app/ayarlar).

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  rol        text not null default 'yonetici' check (rol in ('yonetici', 'goruntuleyici')),
  created_at timestamptz not null default now()
);

-- Yeni bir auth.users satırı oluşunca (davet kabul edilince) otomatik profil
-- açar. Rol, davet gönderilirken user_metadata.rol içine yazılır (bkz.
-- app/ayarlar/actions.ts kullaniciDavetEt).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'rol', 'yonetici')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Zaten var olan hesapları (bu migration'dan önce açılmış) yönetici say.
insert into public.profiles (id, email, rol)
select id, email, 'yonetici' from auth.users
on conflict (id) do nothing;

alter table profiles enable row level security;
drop policy if exists "profil_okuma" on profiles;
create policy "profil_okuma" on profiles for select to authenticated using (true);

-- Mevcut oturumun yönetici olup olmadığını döner — RLS politikalarında
-- (write kısıtı) ve sunucu tarafında (UI gizleme) kullanılır.
create or replace function public.is_yonetici() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'yonetici'
  );
$$;

-- Panel tablolarındaki tek "for all" politikasını, okuma herkese (her iki
-- role) açık, yazma yalnızca yöneticiye açık olacak şekilde böler.
do $$
declare t text;
begin
  foreach t in array array['settings','blocks','units','invoices','invoice_items','receipts'] loop
    execute format('drop policy if exists "panel_tam_yetki" on %I', t);
    execute format('drop policy if exists "panel_okuma" on %I', t);
    execute format('drop policy if exists "panel_ekleme" on %I', t);
    execute format('drop policy if exists "panel_guncelleme" on %I', t);
    execute format('drop policy if exists "panel_silme" on %I', t);

    execute format(
      'create policy "panel_okuma" on %I for select to authenticated using (true)', t);
    execute format(
      'create policy "panel_ekleme" on %I for insert to authenticated with check (is_yonetici())', t);
    execute format(
      'create policy "panel_guncelleme" on %I for update to authenticated using (is_yonetici()) with check (is_yonetici())', t);
    execute format(
      'create policy "panel_silme" on %I for delete to authenticated using (is_yonetici())', t);
  end loop;
end $$;
