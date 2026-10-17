# Supabase schema (expected by ADCOMMAND)

Dokumentasi ini mendeskripsikan tabel/RPC yang dipakai aplikasi. Terapkan di Supabase (SQL Editor / migrasi) jika belum ada. Sesuaikan RLS dengan kebutuhan workspace.

## Tables

### `workspaces`
- `id` uuid PK
- `name` text
- `created_at` timestamptz

### `workspace_members`
- `workspace_id` uuid FK → workspaces
- `user_id` uuid FK → auth.users
- `role` text (`Owner` | `Member`)
- `created_at` timestamptz
- unique (`workspace_id`, `user_id`)

### `profiles`
- `id` uuid PK → auth.users
- `email` text
- `full_name` text
- `role` text (opsional; role akses utama pakai `workspace_members`)

### `ad_networks`
- `id` uuid PK
- `workspace_id` uuid
- `user_id` uuid
- `name` text
- `provider` text
- `enabled` boolean
- `credential_ref` text/nullable (ref ke secret API key)
- `external_url` text/nullable
- `balance` numeric/nullable
- `balance_checked_at` timestamptz/nullable
- `last_synced_at` timestamptz/nullable
- `created_at` timestamptz

### `campaigns`
- `id` uuid PK
- `workspace_id` uuid
- `network_id` uuid
- `external_id` text/nullable
- `name` text
- `status` text
- `created_at` timestamptz

### `campaign_stats`
- `workspace_id` uuid
- `campaign_id` uuid
- `stat_date` date
- `country` text (`ALL` atau kode negara)
- `spend`, `impressions`, `clicks`, `conversions`, `revenue` numeric/nullable
- unique composite sesuai upsert sync

### `site_stats`
- `workspace_id` uuid
- `campaign_id` uuid
- `site_key` text
- `stat_date` date
- `spend`, `impressions`, `clicks`, `conversions` numeric/nullable

### `alerts`
- `id` uuid PK
- `workspace_id` uuid
- `network_id` uuid/nullable
- `type` text (`sync_failed` | `low_balance` | `ctr_drop` | `no_activity` | `new_campaign` | `stale_sync`)
- `title` text
- `message` text
- `read` boolean default false
- `created_at` timestamptz

### `report_exports`
- `id` uuid PK
- `workspace_id` uuid
- `user_id` uuid
- `date_from` date
- `date_to` date
- `member_filter` text/nullable
- `created_at` timestamptz

## RPCs (dipakai app)

- `connect_network(…)` — simpan API key network (dipanggil dari UI connect key)
- `get_network_api_key(p_network_id uuid)` — ambil key untuk user biasa (RLS)
- `get_network_api_key_admin(p_network_id uuid)` — ambil key untuk cron (service role)

Implementasi exact signature harus match panggilan di `lib/` dan `app/`.
