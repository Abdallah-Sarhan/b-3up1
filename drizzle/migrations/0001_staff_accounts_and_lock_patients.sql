-- Staff roles
create type public.app_role as enum ('admin', 'nurse');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_name text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "user_roles readable by authenticated"
  on public.user_roles for select to authenticated using (true);

-- profile row is created automatically from signup metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, login_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock the patient registry down to signed-in staff
drop policy if exists "patients readable by anyone" on public.patients;
drop policy if exists "patients insertable by anyone" on public.patients;
drop policy if exists "patients updatable by anyone" on public.patients;
drop policy if exists "patients deletable by anyone" on public.patients;

revoke all on public.patients from anon;

grant select, insert, update, delete on public.patients to authenticated;
grant all on public.patients to service_role;

create policy "patients readable by staff"
  on public.patients for select to authenticated using (true);
create policy "patients insertable by staff"
  on public.patients for insert to authenticated with check (true);
create policy "patients updatable by staff"
  on public.patients for update to authenticated using (true) with check (true);
create policy "patients deletable by staff"
  on public.patients for delete to authenticated using (true);
