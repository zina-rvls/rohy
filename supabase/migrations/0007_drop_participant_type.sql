-- participant_type (adulte/enfant) ne pilotait aucun calcul ni aucune règle
-- de l'app — le calcul dépend uniquement de share_weight (la part) et de
-- guardian_id (qui est responsable de qui). Le champ était une simple
-- étiquette descriptive, retirée pour simplifier le modèle de données.
alter table public.profiles drop column participant_type;
