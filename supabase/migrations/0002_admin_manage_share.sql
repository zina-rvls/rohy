-- Permet à l'admin d'un groupe de modifier la part de contribution
-- (share_percent) d'un co-membre depuis "gérer les membres" — la policy
-- initiale ne permettait que l'auto-modification de son propre profil.

create function public.can_manage_profile(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.user_id = target
    where g.admin_id = auth.uid()
  );
$$;

create policy "profiles_update_by_group_admin" on public.profiles
  for update using (public.can_manage_profile(id));

-- ------------------------------------------------------------------
-- E-mail sur le profil : nécessaire pour retrouver le compte existant
-- d'une personne ré-invitée depuis un autre groupe (inviteUserByEmail
-- échoue si le compte existe déjà — cf. supabase/functions/invite-member).
-- ------------------------------------------------------------------
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, color, share_percent, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'color', '#7C5CFF'),
    coalesce((new.raw_user_meta_data ->> 'share_percent')::integer, 100),
    new.email
  );
  return new;
end;
$$;
