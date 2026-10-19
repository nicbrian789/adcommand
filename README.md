# ADCOMMAND

Advertising Command Center — dashboard multi-network untuk sync campaign, analytics, alert, dan manajemen workspace.

## Stack

- Next.js 16 + React 19 + Tailwind CSS 4
- Supabase (Auth + Postgres)
- Deploy: Vercel (region `sin1`)

## Setup lokal

1. Install dependensi:

```bash
npm install
```

2. Salin env:

```bash
cp .env.example .env.local
```

Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`.

3. Pastikan skema Supabase sesuai `docs/SCHEMA.md` (tabel + RPC).

4. Jalankan:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) (redirect ke `/dashboard`).

Tanpa env Supabase, auth gating di-skip hanya di development. Di production/Vercel, `/dashboard` tidak dibuka tanpa konfigurasi.

## Env penting

| Variabel | Wajib | Kegunaan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ya | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | Client/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Admin/cron/invite |
| `CRON_SECRET` | ya (prod) | Bearer token cron |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | tidak | Alert ke Telegram |
| `AI_CREDENTIALS_SECRET` | ya (BYOK) | Enkripsi API key AI di Settings |
| `OPENAI_API_KEY` | tidak | Fallback AI server (OpenAI) jika workspace belum BYOK |
| `OPENAI_MODEL` / `OPENAI_BASE_URL` | tidak | Model & endpoint OpenAI-compatible |

## Cron (Vercel)

Didefinisikan di `vercel.json`:

- `/api/cron/auto-sync` — setiap 6 jam
- `/api/cron/stale-sync` — setiap hari jam 02:00 UTC

Keduanya membutuhkan header `Authorization: Bearer $CRON_SECRET` (Vercel Cron mengirim ini otomatis jika `CRON_SECRET` ter-set).

## Fitur utama

- Auth + workspace members (Owner / Member)
- Networks + sync (TrafficStars, TrafficJunky, Adsterra, JuicyAds, Traffic Factory)
- Campaigns, analytics, GEO, websites, reports CSV, alerts
- Buat/edit campaign TrafficStars
- AI Assisten Fase 2 (saran + usulan sync/pause–resume TrafficStars dengan konfirmasi; butuh `OPENAI_API_KEY`)
