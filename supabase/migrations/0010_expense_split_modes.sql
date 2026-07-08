-- Modes de répartition par dépense (au-delà du poids relatif permanent de
-- chaque participant), inspirés de Splitwise :
--   'default' (répartition actuelle, inchangée) : poids habituel de chacun
--   'equal'   : parts strictement égales pour cette dépense précise,
--               en ignorant le poids habituel
--   'shares'  : poids ponctuel par participant, valable pour cette dépense
--               uniquement (n'affecte pas le poids permanent du profil)
--   'exact'   : montant exact par participant (doit sommer au montant total)
--   'percent' : pourcentage par participant (doit sommer à 100)
--
-- Rétrocompatible : toute dépense existante a split_mode = 'default' et
-- split_value = null partout, donc un comportement strictement identique à
-- avant cette migration (cf. scripts/calc.js, computeShares).
alter table public.expenses
  add column split_mode text not null default 'default'
    check (split_mode in ('default', 'equal', 'shares', 'exact', 'percent'));

alter table public.expense_participants
  add column split_value numeric(10, 4);
