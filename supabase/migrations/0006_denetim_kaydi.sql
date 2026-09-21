-- Denetim kaydı: finansal etkisi olan işlemleri kim, ne zaman yaptı?
--
-- Panel çok kullanıcılı (yönetici + görüntüleyici) ve para ile ilgili bir
-- sistem; buna rağmen hiçbir tabloda "kim" bilgisi tutulmuyordu. "Bu faturayı
-- kim ödendi işaretledi?", "Bu daireyi kim sildi?" sorularının cevabı yoktu.
-- Apartman yönetiminde yönetici ve denetçi birlikte çalıştığı için bu kayıt
-- aynı zamanda karşılıklı güvenin dayanağı.

create table if not exists audit_log (
  id          bigserial primary key,
  -- Kullanıcı silinse bile kayıt kalmalı: id null'a düşer, e-posta metin
  -- olarak saklandığı için iz kaybolmaz.
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  eylem       text not null,
  hedef_tur   text,
  hedef_id    text,
  detay       jsonb,
  created_at  timestamptz not null default now()
);

-- Tipik sorgu "son ne oldu" ve "şu faturaya ne yapıldı".
create index if not exists audit_log_zaman_idx on audit_log (created_at desc);
create index if not exists audit_log_hedef_idx on audit_log (hedef_tur, hedef_id, created_at desc);

alter table audit_log enable row level security;

-- Okuma: oturum açmış herkes. Denetçinin de görebilmesi bu kaydın varlık
-- sebebi.
drop policy if exists denetim_okuma on audit_log;
create policy denetim_okuma on audit_log
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE politikası bilerek YOK: yazma yalnızca service_role
-- ile (lib/denetim.ts) yapılır. Böylece kayıt append-only olur — kullanıcı
-- kendi izini silemez veya sahte kayıt üretemez.
-- (Aynı kalıp: 0003_webhook_tekrar_onleme.sql)
