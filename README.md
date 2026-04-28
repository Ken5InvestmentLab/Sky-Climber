# Sky Climber

Vite + React のブラウザゲームです。

## Online Monthly Leaderboard

ランキングは JST の月単位で `month_key` を分けて取得します。月が変わると新しい `month_key` を読むため、表示上の月間ランキングは毎月1日 00:00 JST にリセットされます。

GitHub Pages で他ユーザーのスコアを共有するには、Supabase に次のテーブルを作成し、Repository variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定してください。

```sql
create table if not exists public.sky_climber_scores (
  month_key text not null,
  player_id text not null,
  name text not null,
  score integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month_key, player_id)
);

alter table public.sky_climber_scores enable row level security;

grant select, insert, update on public.sky_climber_scores to anon;
grant select, insert, update on public.sky_climber_scores to authenticated;

-- 同じ月に同じプレイヤーネームを複数人が使えないようにする
-- 既存データに重複名がある場合は、重複を直してから実行してください
create unique index if not exists sky_climber_scores_month_name_unique
on public.sky_climber_scores (month_key, lower(name));

drop policy if exists "Scores are readable" on public.sky_climber_scores;
drop policy if exists "Players can upsert scores" on public.sky_climber_scores;
drop policy if exists "Players can update scores" on public.sky_climber_scores;

create policy "Scores are readable"
on public.sky_climber_scores
for select
using (true);

create policy "Players can upsert scores"
on public.sky_climber_scores
for insert
with check (score >= 0 and char_length(name) between 1 and 12);

create policy "Players can update scores"
on public.sky_climber_scores
for update
using (true)
with check (score >= 0 and char_length(name) between 1 and 12);
```
