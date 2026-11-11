-- ════════════════════════════════════════════════════════════════
--  База даних студії для Supabase
--  Виконайте цей файл ОДИН раз: Supabase → SQL Editor → New query → Run.
--  ПЕРЕД запуском замініть 'owner@example.com' (рядок з INSERT INTO owners)
--  на email власника — той самий, що в studio-config.js (owner.email).
-- ════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

-- ── Власник ─────────────────────────────────────────────────────
-- Лише користувач з цього списку може бачити записи й змінювати дані.
create table if not exists public.owners (email text primary key);
alter table public.owners enable row level security;   -- без політик: напряму недоступна

insert into public.owners (email) values ('owner@example.com') on conflict do nothing;

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_owner() to authenticated;

-- ── Записи клієнтів ─────────────────────────────────────────────
-- ends_at = початок + тривалість + запас між клієнтами.
-- Обмеження bookings_no_overlap на рівні БАЗИ не дає двох активних записів
-- з перетином у одному боксі — навіть якщо двоє натиснуть «Записатися» одночасно.
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  service_id    text not null,
  service_name  text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  duration_min  int  not null,
  box           int  not null,
  customer_name text not null,
  phone         text not null,
  status        text not null default 'new' check (status in ('new', 'confirmed', 'cancelled')),
  created_at    timestamptz not null default now(),
  constraint bookings_time_check check (ends_at > starts_at),
  constraint bookings_no_overlap exclude using gist (
    box with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index if not exists bookings_starts_idx on public.bookings (starts_at);

alter table public.bookings enable row level security;

drop policy if exists bookings_owner_select on public.bookings;
create policy bookings_owner_select on public.bookings
  for select to authenticated using (public.is_owner());

drop policy if exists bookings_owner_update on public.bookings;
create policy bookings_owner_update on public.bookings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Клієнти (anon) не мають прямого доступу до таблиці — тільки через функції нижче.
grant select, update on public.bookings to authenticated;

-- ── Зайняті інтервали (без імен і телефонів) ───────────────────
create or replace function public.get_busy(p_from timestamptz, p_to timestamptz)
returns table (box int, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select b.box, b.starts_at, b.ends_at
  from public.bookings b
  where b.status <> 'cancelled'
    and b.starts_at < p_to
    and b.ends_at   > p_from;
$$;
grant execute on function public.get_busy(timestamptz, timestamptz) to anon, authenticated;

-- ── Створення запису ───────────────────────────────────────────
-- Перебирає бокси 1..p_boxes і вставляє запис у перший вільний.
-- Якщо вільного немає — повертає {"ok": false, "error": "slot_taken"}.
create or replace function public.create_booking(
  p_service_id   text,
  p_service_name text,
  p_starts_at    timestamptz,
  p_duration_min int,
  p_buffer_min   int,
  p_boxes        int,
  p_name         text,
  p_phone        text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_ends  timestamptz;
  v_box   int;
  v_id    uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if p_service_id is null or char_length(p_service_id) not between 1 and 64
     or p_service_name is null or char_length(p_service_name) not between 1 and 120
     or p_duration_min is null or p_duration_min not between 5 and 720
     or p_buffer_min   is null or p_buffer_min   not between 0 and 120
     or p_boxes        is null or p_boxes        not between 1 and 20
     or p_starts_at    is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_starts_at < now() then
    return jsonb_build_object('ok', false, 'error', 'in_past');
  end if;
  if p_starts_at > now() + interval '120 days' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_ends := p_starts_at + make_interval(mins => p_duration_min + p_buffer_min);

  for v_box in 1..p_boxes loop
    begin
      insert into public.bookings
        (service_id, service_name, starts_at, ends_at, duration_min, box, customer_name, phone)
      values
        (p_service_id, p_service_name, p_starts_at, v_ends, p_duration_min, v_box, v_name, v_phone)
      returning id into v_id;
      return jsonb_build_object('ok', true, 'id', v_id, 'box', v_box);
    exception when exclusion_violation then
      null;  -- цей бокс зайнятий, пробуємо наступний
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;
grant execute on function public.create_booking(text, text, timestamptz, int, int, int, text, text) to anon, authenticated;

-- ── Правки власника (послуги, контакти, закриті дні, фото на сайті) ─
create table if not exists public.studio_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.studio_settings enable row level security;

drop policy if exists settings_read on public.studio_settings;
create policy settings_read on public.studio_settings
  for select to anon, authenticated using (true);

drop policy if exists settings_owner_insert on public.studio_settings;
create policy settings_owner_insert on public.studio_settings
  for insert to authenticated with check (public.is_owner());

drop policy if exists settings_owner_update on public.studio_settings;
create policy settings_owner_update on public.studio_settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists settings_owner_delete on public.studio_settings;
create policy settings_owner_delete on public.studio_settings
  for delete to authenticated using (public.is_owner());

grant select on public.studio_settings to anon, authenticated;
grant insert, update, delete on public.studio_settings to authenticated;

-- ── Сховище фото ───────────────────────────────────────────────
-- Публічне читання, завантаження лише для власника, до 5 МБ, тільки зображення.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists photos_owner_insert on storage.objects;
create policy photos_owner_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_owner());

drop policy if exists photos_owner_update on storage.objects;
create policy photos_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_owner())
  with check (bucket_id = 'photos' and public.is_owner());

drop policy if exists photos_owner_delete on storage.objects;
create policy photos_owner_delete on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_owner());
