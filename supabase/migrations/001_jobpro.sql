create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'General',
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  links jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  parsed_text text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  company text not null default '',
  location text not null default '',
  description text not null default '',
  url text not null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(source, external_id)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  url text not null default '',
  company text not null default '',
  title text not null default '',
  status text not null default 'saved' check (status in ('saved','applied','screening','interview','offer','rejected','withdrawn')),
  applied_at timestamptz,
  notes text not null default '',
  match_score integer check (match_score between 0 and 100),
  resume_id uuid references public.resumes(id) on delete set null
);

create table if not exists public.saved_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_hash text not null,
  question text not null,
  answer text not null,
  updated_at timestamptz not null default now(),
  unique(user_id, question_hash)
);

create index if not exists applications_user_id_idx on public.applications(user_id);
create index if not exists resumes_user_id_idx on public.resumes(user_id);
create index if not exists saved_answers_user_id_idx on public.saved_answers(user_id);
create index if not exists jobs_posted_at_idx on public.jobs(posted_at desc);

alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.saved_answers enable row level security;

drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own rows" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "resumes own rows" on public.resumes;
create policy "resumes own rows" on public.resumes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "jobs public read" on public.jobs;
create policy "jobs public read" on public.jobs for select using (true);

drop policy if exists "jobs authenticated write" on public.jobs;
create policy "jobs authenticated write" on public.jobs for insert with check (auth.uid() is not null);

drop policy if exists "applications own rows" on public.applications;
create policy "applications own rows" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "saved answers own rows" on public.saved_answers;
create policy "saved answers own rows" on public.saved_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.resumes add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists resumes_updated_at on public.resumes;
create trigger resumes_updated_at before update on public.resumes for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resume objects own read" on storage.objects;
create policy "resume objects own read" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resume objects own insert" on storage.objects;
create policy "resume objects own insert" on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resume objects own update" on storage.objects;
create policy "resume objects own update" on storage.objects for update to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resume objects own delete" on storage.objects;
create policy "resume objects own delete" on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);


create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  action text not null,
  result text not null,
  created_at timestamptz not null default now(),
  unique(user_id, cache_key)
);
alter table public.ai_cache enable row level security;
drop policy if exists "ai cache own rows" on public.ai_cache;
create policy "ai cache own rows" on public.ai_cache for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists ai_cache_user_created_idx on public.ai_cache(user_id, created_at desc);
