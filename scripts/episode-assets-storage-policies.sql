-- Supabase Storage policies for bucket: episode-assets
-- Purpose:
-- 1) Allow public read of episode map/npc assets
-- 2) Allow only admin users (profiles.is_admin = true) to write
-- 3) Restrict writes to allowed prefixes:
--    - episode-maps/<episode_id>/...
--    - episode-npcs/<episode_id>/...

-- Ensure bucket exists (safe if already exists)
insert into storage.buckets (id, name, public)
values ('episode-assets', 'episode-assets', true)
on conflict (id) do update
set public = true;

-- Clean existing policies for this bucket name (safe if not present)
drop policy if exists "episode_assets_public_read" on storage.objects;
drop policy if exists "episode_assets_admin_insert" on storage.objects;
drop policy if exists "episode_assets_admin_update" on storage.objects;
drop policy if exists "episode_assets_admin_delete" on storage.objects;

-- Public read (for map/npc URLs shown in player/storyteller UIs)
create policy "episode_assets_public_read"
on storage.objects
for select
to public
using (
  bucket_id = 'episode-assets'
);

-- Admin insert only, constrained to valid folders
create policy "episode_assets_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'episode-assets'
  and split_part(name, '/', 1) in ('episode-maps', 'episode-npcs')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

-- Admin update only, constrained to valid folders
create policy "episode_assets_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'episode-assets'
  and split_part(name, '/', 1) in ('episode-maps', 'episode-npcs')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
)
with check (
  bucket_id = 'episode-assets'
  and split_part(name, '/', 1) in ('episode-maps', 'episode-npcs')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

-- Admin delete only, constrained to valid folders
create policy "episode_assets_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'episode-assets'
  and split_part(name, '/', 1) in ('episode-maps', 'episode-npcs')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

