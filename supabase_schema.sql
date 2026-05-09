-- ═══════════════════════════════════════════════════
--  شغّل الكود ده في Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════

-- جدول الأعضاء
create table if not exists members (
  id text primary key,
  name text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- جدول التكليفات
create table if not exists tasks (
  id bigint primary key,
  member_id text not null references members(id) on delete cascade,
  week_key text not null,       -- مثال: "week_0", "week_1"
  text text not null,
  done boolean default false,
  created_at timestamptz default now()
);

-- جدول الملاحظات
create table if not exists notes (
  id serial primary key,
  member_id text,               -- null = ملاحظة عامة
  week_key text not null,
  content text default '',
  updated_at timestamptz default now(),
  unique(member_id, week_key)
);

-- جدول إعدادات الأسبوع الحالي
create table if not exists app_settings (
  key text primary key,
  value text not null
);

insert into app_settings (key, value)
values ('week_offset', '0')
on conflict (key) do nothing;

-- تفعيل الوصول العام (بدون login)
alter table members       enable row level security;
alter table tasks         enable row level security;
alter table notes         enable row level security;
alter table app_settings  enable row level security;

create policy "public_all" on members       for all using (true) with check (true);
create policy "public_all" on tasks         for all using (true) with check (true);
create policy "public_all" on notes         for all using (true) with check (true);
create policy "public_all" on app_settings  for all using (true) with check (true);
