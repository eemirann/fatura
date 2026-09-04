-- Kısmi ödeme desteği — paylaşımlı dairelerde birden fazla kişi ayrı ayrı
-- dekont gönderdiğinde tek tek "tutar uyuşmadı" yerine "kısmi ödeme" olarak
-- işaretlenir, toplam fatura tutarına ulaşınca otomatik "ödendi" olur.
-- Supabase SQL Editor'e olduğu gibi yapıştırıp çalıştırın (0001_init.sql'in
-- ardından).

alter type receipt_eslesme add value if not exists 'kismi';
