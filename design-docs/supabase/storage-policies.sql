-- ============================================================================
-- 班主任管理系统 · Storage 桶策略
-- 前置：schema.sql 已执行；在 Supabase SQL Editor 中执行本文件
-- ============================================================================

-- 创建私有照片桶（幂等）
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- 私有桶：仅登录用户可读写
create policy "photos_select" on storage.objects
  for select using (bucket_id = 'photos' and auth.role() = 'authenticated');

create policy "photos_insert" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');

create policy "photos_update" on storage.objects
  for update using (bucket_id = 'photos' and auth.role() = 'authenticated');

create policy "photos_delete" on storage.objects
  for delete using (bucket_id = 'photos' and auth.role() = 'authenticated');
