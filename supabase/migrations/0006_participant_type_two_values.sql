-- "personne à charge" n'est plus une valeur de participant_type au même
-- niveau que adulte/enfant : c'était source de confusion dans "gérer les
-- membres" (présenté comme un 3e choix de "type" alors que la prise en
-- charge est déjà entièrement portée par guardian_id, indépendamment de la
-- catégorie adulte/enfant). participant_type ne décrit plus désormais que
-- la catégorie d'âge ; l'app affiche un badge "à charge" calculé à partir
-- de guardian_id plutôt que de proposer une 3e option de type.
update public.profiles set participant_type = 'enfant' where participant_type = 'personne_a_charge';

alter table public.profiles drop constraint profiles_participant_type_check;
alter table public.profiles add constraint profiles_participant_type_check
  check (participant_type in ('adulte', 'enfant'));
