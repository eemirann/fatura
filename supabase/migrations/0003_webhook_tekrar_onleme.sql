-- WAHA webhook'unun aynı WhatsApp mesajını iki kez işlemesini önler (ör. ağ
-- kesintisi sonrası WAHA'nın aynı çağrıyı tekrar denemesi). Her mesaj id'si
-- yalnızca bir kez işlenebilir; ikinci deneme benzersizlik kısıtına takılıp
-- sessizce atlanır.
-- Supabase SQL Editor'e olduğu gibi yapıştırıp çalıştırın (0001 ve 0002'nin
-- ardından).

create table if not exists processed_wa_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);

alter table processed_wa_messages enable row level security;

-- Yalnızca service_role (webhook) yazıyor/okuyor; panel kullanıcısının
-- buna erişimi olmadığı için authenticated'a bilerek hiçbir politika
-- tanımlanmıyor (RLS varsayılan olarak her şeyi reddeder).
