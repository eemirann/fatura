-- Dekont tarihi fatura dönemine uymadığında ayrı bir eşleşme durumu.
--
-- Önceki davranış bir para hatasıydı: tarih kontrolü yalnızca açıklamaya bir
-- uyarı cümlesi ekliyordu, tutar tuttuğu anda fatura yine "ödendi" oluyordu.
-- Yani kiracı elindeki eski bir dekontu (geçen ayın, hatta aylar önceki bir
-- havalenin dekontunu) yükleyince fatura sessizce yeşile dönüyordu.
--
-- Artık bu durumda dekont "tarih_uyusmadi" olarak işaretlenir: dosya
-- kaybolmaz, panelde görünür ve elle kontrole düşer, ama faturayı KAPATMAZ.
-- Yönetici bakıp gerçekten bu aya aitse "Elle ödendi işaretle" diyebilir.

alter type receipt_eslesme add value if not exists 'tarih_uyusmadi';
