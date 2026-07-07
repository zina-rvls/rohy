-- Étape 1 du brief "Gestion des foyers, personnes à charge et parts
-- pondérées" : fondations de données + moteur de calcul.
--
-- Changements :
-- 1. `profiles.id` n'est plus obligatoirement lié à un compte auth.users :
--    une personne à charge peut exister sans e-mail ni compte. On ajoute
--    `auth_user_id` (nullable, unique) pour les profils qui ONT un compte
--    réel, et on réécrit les policies RLS pour résoudre "qui suis-je" via
--    `my_profile_id()` plutôt que de comparer directement `id = auth.uid()`.
-- 2. `default_covered_by` renommé `guardian_id` (même concept : prise en
--    charge permanente / responsable), terminologie alignée sur le brief.
-- 3. `share_percent` (entier 0-100, "% de la dépense") remplacé par
--    `share_weight` (décimal, coefficient relatif — 1 = part entière, 0.5 =
--    demi-part, peu importe le nombre d'autres participants). Migration :
--    share_weight = share_percent / 100 (mathématiquement équivalent au
--    modèle de poids relatif d'origine).
-- 4. `participant_type` (adulte / enfant / personne_a_charge) — label,
--    n'affecte pas le calcul en lui-même (le calcul suit `share_weight` et
--    `guardian_id`).
-- 5. `households` (foyers) + `profiles.household_id`.

-- ============================================================
-- 1. Découplage identité / compte auth
-- ============================================================
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column auth_user_id uuid unique references auth.users (id) on delete cascade;
update public.profiles set auth_user_id = id where auth_user_id is null;

-- ============================================================
-- 2. Renommage default_covered_by -> guardian_id (avant toute policy qui
--    y fait référence, sinon erreur "column does not exist" au parsing).
-- ============================================================
alter table public.profiles rename column default_covered_by to guardian_id;

-- ============================================================
-- 3. my_profile_id() + fonctions RLS existantes réécrites pour résoudre
--    "moi" ainsi plutôt que comparer directement auth.uid() (qui identifie
--    le compte, plus forcément égal à profiles.id maintenant qu'une
--    personne à charge peut exister sans compte).
-- ============================================================
create function public.my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = gid and gm.user_id = public.my_profile_id()
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.admin_id = public.my_profile_id()
  );
$$;

create or replace function public.shares_group_with(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = public.my_profile_id() and theirs.user_id = target
  );
$$;

create or replace function public.can_manage_profile(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.user_id = target
    where g.admin_id = public.my_profile_id()
  );
$$;

-- ============================================================
-- 4. Policies qui comparaient directement `= auth.uid()` : réécrites pour
--    utiliser my_profile_id() (sauf profiles_update_self, qui compare
--    désormais auth_user_id = auth.uid(), ce qui reste correct tel quel).
--    profiles_select gagne aussi deux clauses pour les personnes à charge :
--    le responsable (guardian_id = moi) doit toujours voir son profil, et
--    quiconque partage un groupe avec le responsable doit aussi le voir
--    (symétrique à profiles_insert_dependent : si j'ai pu créer cette
--    personne à charge, je dois pouvoir la relire ensuite). Les deux
--    premières clauses sont des comparaisons directes exprès : lors d'un
--    INSERT ... RETURNING, une fonction imbriquée qui re-scanne la table
--    ne voit pas de façon fiable la ligne tout juste insérée (même
--    problème corrigé pour groups_select en migration 0003).
-- ============================================================
drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = public.my_profile_id()
    or guardian_id = public.my_profile_id()
    or public.shares_group_with(id)
    or (guardian_id is not null and public.shares_group_with(guardian_id))
  );

drop policy "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth_user_id = auth.uid());

drop policy "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select using (public.is_group_member(id) or admin_id = public.my_profile_id());

drop policy "groups_insert_admin" on public.groups;
create policy "groups_insert_admin" on public.groups
  for insert with check (admin_id = public.my_profile_id());

drop policy "groups_update_admin" on public.groups;
create policy "groups_update_admin" on public.groups
  for update using (admin_id = public.my_profile_id());

drop policy "groups_delete_admin" on public.groups;
create policy "groups_delete_admin" on public.groups
  for delete using (admin_id = public.my_profile_id());

drop policy "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete using (
    public.is_group_admin(group_id) or user_id = public.my_profile_id()
  );

drop policy "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    from_user = public.my_profile_id() or to_user = public.my_profile_id()
    or (group_id is not null and public.is_group_member(group_id))
  );

drop policy "payments_insert" on public.payments;
create policy "payments_insert" on public.payments
  for insert with check (
    (from_user = public.my_profile_id() or to_user = public.my_profile_id())
    and (group_id is null or public.is_group_member(group_id))
  );

drop policy "reminders_select" on public.reminders;
create policy "reminders_select" on public.reminders
  for select using (from_user = public.my_profile_id() or to_user = public.my_profile_id());

drop policy "reminders_insert" on public.reminders;
create policy "reminders_insert" on public.reminders
  for insert with check (from_user = public.my_profile_id());

-- Permet de créer un profil "personne à charge" (sans compte auth) pour
-- soi-même ou pour un participant avec qui on partage déjà un groupe.
create policy "profiles_insert_dependent" on public.profiles
  for insert with check (
    auth_user_id is null
    and guardian_id is not null
    and (guardian_id = public.my_profile_id() or public.shares_group_with(guardian_id))
  );

-- Permet au responsable (guardian) de modifier le profil d'une personne à
-- charge (nom, coefficient, foyer...) même si elle n'est pas encore membre
-- d'un groupe (profiles_update_by_group_admin ne couvrirait pas ce cas).
create policy "profiles_update_dependent_by_guardian" on public.profiles
  for update using (auth_user_id is null and guardian_id = public.my_profile_id());

-- ============================================================
-- 5. share_percent -> share_weight (coefficient relatif)
-- ============================================================
alter table public.profiles add column share_weight numeric(5, 2) not null default 1 check (share_weight >= 0);
update public.profiles set share_weight = coalesce(share_percent, 100)::numeric / 100;
alter table public.profiles drop column share_percent;

-- ============================================================
-- 6. Type de participant
-- ============================================================
alter table public.profiles add column participant_type text not null default 'adulte'
  check (participant_type in ('adulte', 'enfant', 'personne_a_charge'));

-- ============================================================
-- 7. Foyers
-- ============================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column household_id uuid references public.households (id) on delete set null;

alter table public.households enable row level security;

-- Le premier terme (created_by = my_profile_id()) est volontairement une
-- comparaison directe dans la policy, pas une fonction imbriquée avec sa
-- propre sous-requête : lors d'un INSERT ... RETURNING, une sous-requête
-- qui re-scanne la table ne voit pas de façon fiable la ligne tout juste
-- insérée (même problème qui a nécessité le correctif de la migration
-- 0003 pour groups_select). La comparaison directe, elle, s'évalue contre
-- la ligne en cours et fonctionne bien à la création.
create policy "households_select" on public.households
  for select using (
    created_by = public.my_profile_id()
    or exists (
      select 1 from public.profiles p
      where p.household_id = households.id
        and (p.id = public.my_profile_id() or public.shares_group_with(p.id))
    )
  );

create policy "households_insert" on public.households
  for insert with check (created_by = public.my_profile_id());

create policy "households_update" on public.households
  for update using (created_by = public.my_profile_id());

create policy "households_delete" on public.households
  for delete using (created_by = public.my_profile_id());

-- ============================================================
-- 8. Trigger de création de profil : auth_user_id + share_weight + email
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, auth_user_id, name, color, share_weight, email)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'color', '#7C5CFF'),
    coalesce(
      (new.raw_user_meta_data ->> 'share_weight')::numeric,
      (new.raw_user_meta_data ->> 'share_percent')::numeric / 100,
      1
    ),
    new.email
  );
  return new;
end;
$$;
