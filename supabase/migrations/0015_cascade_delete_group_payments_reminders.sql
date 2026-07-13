-- Corrige un bug de cohérence des données : supprimer un groupe supprimait
-- déjà (cascade) ses dépenses, mais pas ses règlements (`payments`), dont le
-- group_id passait juste à null (`on delete set null`) — ils restaient donc
-- en base indéfiniment et continuaient d'alimenter le calcul de solde
-- "tous groupes confondus" (computeDebts côté client) et l'écran Historique,
-- même une fois le groupe (et toutes ses dépenses) supprimé. Résultat
-- visible : l'accueil et l'historique continuaient d'afficher "qui doit
-- combien à qui" après suppression complète des groupes d'un compte.
--
-- On aligne payments.group_id sur le même comportement que expenses.group_id
-- (on delete cascade), et on ajoute un group_id à reminders (absent jusqu'ici
-- : un rappel n'était rattaché qu'aux deux personnes, jamais à un groupe) —
-- nullable, rempli seulement quand le rappel est envoyé depuis un écran
-- filtré sur un groupe précis (cf. reminderGroupId côté client) ; un rappel
-- envoyé depuis la vue "tous groupes confondus" garde group_id à null et
-- n'est donc pas concerné par cette cascade.
alter table public.payments drop constraint payments_group_id_fkey;
alter table public.payments add constraint payments_group_id_fkey
  foreign key (group_id) references public.groups (id) on delete cascade;

alter table public.reminders add column group_id uuid references public.groups (id) on delete cascade;
