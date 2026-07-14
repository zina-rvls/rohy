-- Lien d'invitation public par groupe (façon Tricount/Kittysplit) : contrairement
-- à l'invitation par e-mail (invite-member) ou au membre "invité sans compte"
-- (juste une fiche gérée par l'admin, sans accès propre à l'app), la personne
-- qui ouvre ce lien devient un vrai participant — elle voit ses dépenses et
-- son solde, et peut en ajouter — sans jamais créer de compte e-mail/mot de
-- passe. Ça repose sur l'authentification anonyme de Supabase
-- (signInAnonymously côté client) : une vraie session est créée, auth.uid()
-- fonctionne normalement, donc les policies RLS existantes n'ont pas besoin
-- de changer une fois la personne ajoutée à group_members. Un compte anonyme
-- peut être transformé en compte permanent plus tard (auth.updateUser côté
-- client) en conservant le même id, donc tout son historique.
--
-- share_token : jeton opaque régénérable par l'admin (regénérer = révoquer
-- l'ancien lien). Nullable : un groupe sans lien généré n'est pas rejoignable.
alter table public.groups add column share_token text unique;

-- Un compte anonyme n'a pas d'e-mail, donc split_part(new.email, '@', 1)
-- (utilisé jusqu'ici comme repli de nom) vaut null pour lui — on ajoute un
-- dernier repli "Invité" ; le vrai prénom est renseigné juste après par le
-- client (profiles_update_self l'autorise déjà) lors de la confirmation du
-- lien, cf. Edge Function join-group.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, color, share_percent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Invité'),
    coalesce(new.raw_user_meta_data ->> 'color', '#7C5CFF'),
    coalesce((new.raw_user_meta_data ->> 'share_percent')::integer, 100)
  );
  return new;
end;
$$;
