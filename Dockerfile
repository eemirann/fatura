# Next.js paneli — kendi sunucumuzda (VPS) Docker içinde koşar.
#
# Çok aşamalı: derleme bağımlılıkları son imaja girmez. next.config.ts'teki
# `output: "standalone"` sayesinde runner aşamasına npm install taşımıyoruz;
# Next çalışmak için gereken node_modules'ü .next/standalone içine kendisi
# kopyalıyor.
#
# SITE_URL burada derleme argümanı DEĞİL, çalışma anı değişkenidir (bkz.
# lib/site-url.ts) — alan adı imaja gömülmez.
#
# Ama NEXT_PUBLIC_SUPABASE_* değerleri tarayıcıya ulaşmak zorunda olduğu için
# derleme anında gömülür. Her müşterinin kendi Supabase projesi olacağından
# imaj müşteriye özeldir; zaten her müşteri kendi sunucusunda derliyor.

# ---------------------------------------------------------------- bagimliliklar
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------- derleme
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Bu iki deger tarayiciya ulasmak zorunda (lib/supabase/client.ts), dolayisiyla
# Next onlari derleme aninda pakete gomer — calisma aninda verilemezler.
# Verilmezlerse istemci paketine "undefined" gomulur ve tarayicidan giris
# sessizce kirilir (sunucu tarafi calismaya devam ettigi icin fark edilmesi zor).
# anon key zaten herkese acik olacak bir degerdir; veriyi RLS korur.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || (echo "HATA: NEXT_PUBLIC_SUPABASE_URL derleme argumani bos" && exit 1)
RUN npm run build

# ----------------------------------------------------------------------- calisma
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Root olarak çalıştırmıyoruz.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# standalone sunucu + istemci varlıkları (static, standalone'a dahil değildir)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3100/giris').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
