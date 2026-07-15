-- Conversion de devise par dépense : une dépense peut être payée dans une
-- devise différente de celle du groupe (ex. billet d'avion payé en euros
-- dans un groupe suivi en ariary). `amount` continue de représenter le
-- montant dans la devise du GROUPE (aucun changement pour calc.js, qui
-- ignore tout ce qui suit) ; original_currency/original_amount/
-- exchange_rate ne sont que des métadonnées d'affichage et d'historique,
-- renseignées uniquement quand la devise de la dépense diffère de celle du
-- groupe. exchange_rate est figé au moment de la dépense (jamais recalculé
-- après coup), pour garder un historique fidèle même si le taux du jour
-- change ensuite ou si le taux "gelé" du groupe est modifié plus tard.
alter table public.expenses
  add column original_currency text,
  add column original_amount numeric(14, 4) check (original_amount is null or original_amount > 0),
  add column exchange_rate numeric(14, 6) check (exchange_rate is null or exchange_rate > 0),
  add constraint expenses_original_currency_consistency check (
    (original_currency is null and original_amount is null and exchange_rate is null) or
    (original_currency is not null and original_amount is not null and exchange_rate is not null)
  );

-- Option de groupe : quand activée, le taux saisi pour une devise donnée est
-- réutilisé comme pré-remplissage pour toutes les dépenses suivantes de ce
-- groupe dans la même devise (cf. group_currency_rates), plutôt que
-- d'aller rechercher un taux du jour à chaque fois.
alter table public.groups
  add column freeze_currency_rates boolean not null default false;

-- Dernier taux utilisé par devise pour un groupe donné — sert de
-- pré-remplissage (que freeze_currency_rates soit actif ou non : sert aussi
-- de repli hors-ligne si la récupération du taux du jour échoue).
create table public.group_currency_rates (
  group_id uuid not null references public.groups (id) on delete cascade,
  currency text not null,
  rate numeric(14, 6) not null check (rate > 0),
  updated_at timestamptz not null default now(),
  primary key (group_id, currency)
);

alter table public.group_currency_rates enable row level security;

create policy "group_currency_rates_select" on public.group_currency_rates
  for select using (public.is_group_member(group_id));

create policy "group_currency_rates_upsert" on public.group_currency_rates
  for insert with check (public.is_group_member(group_id));

create policy "group_currency_rates_update" on public.group_currency_rates
  for update using (public.is_group_member(group_id));
