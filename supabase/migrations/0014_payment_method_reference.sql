-- Ajoute la traçabilité du moyen de paiement utilisé pour régler une dette
-- (cf. discussion mobile money) : l'app ne s'intègre à aucune passerelle de
-- paiement (MVola/Orange Money/Airtel Money n'exposent pas de webhook de
-- confirmation exploitable ici) et reste donc entièrement déclarative,
-- comme le reste du règlement des dettes — mais on garde une trace de
-- comment/où le paiement a été fait, utile en cas de désaccord ultérieur.
alter table public.payments add column payment_method text
  check (payment_method in ('mvola', 'orange_money', 'airtel_money', 'especes', 'autre'));
alter table public.payments add column payment_reference text;
