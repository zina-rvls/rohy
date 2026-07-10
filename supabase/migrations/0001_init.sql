-- Rohy — schéma initial (P0 : auth réelle + persistance réelle)
-- À exécuter une fois sur le projet Supabase (SQL Editor ou `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
-- Un profil par utilisateur auth.users, créé automatiquement à l'inscription
-- (voir trigger plus bas). `share_percent` généralise l'ancien "childPercent" :
-- poids de répartition par défaut de la personne (100% = part entière).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#7C5CFF',
  share_percent integer not null default 100 check (share_percent between 0 and 100),
  default_covered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- groups ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'ph-bold ph-users-three',
  currency text not null default 'EUR',
  admin_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- group_members ----------
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- expenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  label text not null,
  icon text not null default 'ph-bold ph-receipt',
  amount numeric(10, 2) not null check (amount > 0),
  paid_external numeric(10, 2) check (paid_external >= 0),
  paid_by uuid not null references public.profiles (id),
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------- expense_participants ----------
-- override_responsible_id = prise en charge ponctuelle pour cette dépense
-- précise (null = utiliser default_covered_by du participant, ou lui-même).
create table public.expense_participants (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  override_responsible_id uuid references public.profiles (id),
  primary key (expense_id, user_id)
);

-- ---------- payments ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  amount numeric(10, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  group_id uuid references public.groups (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- reminders ----------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  amount numeric(10, 2) not null,
  message text not null,
  reminder_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Création automatique du profil à l'inscription (mot de passe,
-- lien magique, ou invitation par e-mail — tous passent par auth.users).
-- Le nom et le pourcentage de part peuvent être fournis via les métadonnées
-- utilisateur (`options.data` de `inviteUserByEmail` / `signUp`).
-- ============================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, color, share_percent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'color', '#7C5CFF'),
    coalesce((new.raw_user_meta_data ->> 'share_percent')::integer, 100)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Fonctions utilitaires pour les policies RLS (SECURITY DEFINER pour
-- éviter les problèmes de récursion RLS sur group_members lui-même).
-- ============================================================
create function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid()
  );
$$;

create function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.admin_id = auth.uid()
  );
$$;

create function public.shares_group_with(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = target
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.payments enable row level security;
alter table public.reminders enable row level security;

-- profiles : on voit son propre profil + celui des gens avec qui on partage
-- au moins un groupe ; on ne modifie que le sien.
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.shares_group_with(id));

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

-- groups : visibles si on en est membre ; créés/modifiés/supprimés par l'admin.
create policy "groups_select" on public.groups
  for select using (public.is_group_member(id));

create policy "groups_insert_admin" on public.groups
  for insert with check (admin_id = auth.uid());

create policy "groups_update_admin" on public.groups
  for update using (admin_id = auth.uid());

create policy "groups_delete_admin" on public.groups
  for delete using (admin_id = auth.uid());

-- group_members : visibles par les membres du groupe ; ajoutés par l'admin
-- (l'invitation par e-mail passe par l'edge function avec la clé service,
-- qui contourne RLS — cette policy sert de garde-fou si l'admin agit
-- directement) ; un membre peut se retirer lui-même (quitter le groupe).
create policy "group_members_select" on public.group_members
  for select using (public.is_group_member(group_id));

create policy "group_members_insert_admin" on public.group_members
  for insert with check (public.is_group_admin(group_id));

create policy "group_members_delete" on public.group_members
  for delete using (
    public.is_group_admin(group_id) or user_id = auth.uid()
  );

-- expenses : lisibles/modifiables par tout membre du groupe (comme dans le
-- prototype front-end, pas de restriction supplémentaire par rôle).
create policy "expenses_select" on public.expenses
  for select using (public.is_group_member(group_id));

create policy "expenses_insert" on public.expenses
  for insert with check (public.is_group_member(group_id));

create policy "expenses_update" on public.expenses
  for update using (public.is_group_member(group_id));

create policy "expenses_delete" on public.expenses
  for delete using (public.is_group_member(group_id));

-- expense_participants : suit le groupe de la dépense parente.
create policy "expense_participants_select" on public.expense_participants
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy "expense_participants_insert" on public.expense_participants
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy "expense_participants_update" on public.expense_participants
  for update using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy "expense_participants_delete" on public.expense_participants
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- payments : visibles/créables par les deux parties concernées (et, si
-- rattaché à un groupe, réservé aux membres de ce groupe).
create policy "payments_select" on public.payments
  for select using (
    from_user = auth.uid() or to_user = auth.uid()
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy "payments_insert" on public.payments
  for insert with check (
    (from_user = auth.uid() or to_user = auth.uid())
    and (group_id is null or public.is_group_member(group_id))
  );

-- reminders : visibles/créables par les deux parties concernées.
create policy "reminders_select" on public.reminders
  for select using (from_user = auth.uid() or to_user = auth.uid());

create policy "reminders_insert" on public.reminders
  for insert with check (from_user = auth.uid());
