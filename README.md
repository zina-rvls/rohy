# Rohy — suivi des dépenses entre amis

Application de suivi de dépenses partagées entre amis/famille : qui a payé
quoi, la part de contribution de chacun (réglable par personne, ex. 0,5 =
demi-part), foyers et personnes à charge (prise en charge permanente, dette
automatiquement fusionnée avec le responsable), et qui doit quoi à qui après
paiements déjà effectués. Groupes/événements multiples (avec devise et
invitation par e-mail à la création), historique, relance de paiement.

Ce dépôt implémente le hand-off de design **Rohy** (prototype HTML fourni
séparément) : les écrans ont été recréés fidèlement en HTML/CSS/JS vanilla,
le moteur de calcul a été porté tel quel dans un module testé
indépendamment, et le backend réel (auth, base de données, invitations par
e-mail) tourne sur Supabase — cf. `supabase/README.md` pour la mise en place.

## Lancer l'app

Aucune dépendance ni build côté front-end : ouvrir `index.html` dans un
navigateur, ou servir le dossier statiquement, par exemple :

```
python3 -m http.server 8000
```

puis http://localhost:8000/. Il faut un projet Supabase configuré (cf.
`supabase/README.md`) pour que l'inscription/connexion et les données
fonctionnent réellement.

## Lancer les tests du moteur de calcul

```
node tests/calc.test.js
```

## Architecture

- `scripts/calc.js` — moteur de calcul pur (aucune dépendance DOM) : parts par
  participant (`computeShares` — chaque participant a un poids relatif
  `shareWeight`, 1 = part entière par défaut ; sa part sur une dépense est
  proportionnelle à son poids par rapport à la somme des poids de tous les
  participants), responsabilité (override ponctuel / prise en charge
  permanente via `guardianId` / soi-même — une personne à charge voit sa
  dette automatiquement fusionnée avec celle de son responsable), dette
  brute et nette par paire, simplification glouton créditeurs/débiteurs,
  statut de remboursement par dépense (FIFO chronologique), part restant due
  sur un acompte versé à un tiers. C'est la partie identifiée comme la plus
  risquée à réécrire sans filet — elle est donc isolée et testée séparément
  de l'UI, pour pouvoir être reprise telle quelle côté serveur.
  `computeShares` accepte en 4e argument optionnel la dépense elle-même :
  si elle porte un `splitMode` différent de `'default'` (`'equal'`, `'shares'`,
  `'exact'`, `'percent'`, inspirés de Splitwise), le poids utilisé pour
  chaque participant vient de `splitValues` plutôt que de son `shareWeight`
  permanent — une seule et même formule pondérée pour les 5 modes (un
  montant exact ou un pourcentage n'est jamais qu'un poids exprimé
  différemment, ce qui reste correct même réparti sur un montant partiel,
  cf. `paidExternal`). Sans 4e argument (ou `splitMode: 'default'`),
  comportement strictement inchangé.
- `tests/calc.test.js` — tests unitaires (`node tests/calc.test.js`, sans
  dépendance externe) couvrant : dette croisée entre 2+ personnes, prise en
  charge permanente vs ponctuelle, parts pondérées (poids relatif)
  mixées avec des parts "normales", paiement partiel réparti sur plusieurs
  dépenses (FIFO), acomptes à des tiers, simplification des dettes.
- `scripts/data.js` — liste des devises proposées à la création d'un groupe
  (les personnes viennent de Supabase, table `profiles`).
- `scripts/supabase-client.js` — instancie le client `supabase-js` (URL du
  projet + clé publiable — sûres à exposer côté client, protégées par les
  policies RLS plutôt que par le secret).
- `scripts/app.js` — état de l'application, rendu de tous les écrans/modales,
  délégation d'événements, auth et données via Supabase (cf. `supabase/`).
- `styles/style.css` — design tokens Rohy (couleurs, typographie, rayons,
  ombres) en variables CSS, thèmes clair/sombre.
- `supabase/` — schéma Postgres, policies RLS, fonction d'invitation par
  e-mail. Cf. `supabase/README.md` pour la mise en place complète.

## Modèle de données

- Premier lancement : aucun contact ni groupe préexistant, seul le compte
  qu'on vient de créer existe. Les autres membres entrent dans l'app soit à
  la création d'un groupe (prénom + e-mail facultatif + part), soit via
  "+ ajouter un membre" depuis "gérer les membres" d'un groupe déjà créé
  (même formulaire). Dans les deux cas, l'e-mail, s'il est renseigné,
  déclenche une vraie invitation (compte créé, e-mail envoyé via Supabase
  Auth `inviteUserByEmail`) ; sinon un profil sans compte Supabase Auth est
  simplement ajouté au groupe. Le responsable (`guardian_id`, réglable
  seulement depuis "gérer les membres" une fois le groupe créé) est
  indépendant de l'e-mail — un membre avec compte peut aussi avoir un
  responsable, et un membre sans compte peut ne pas en avoir (un simple
  "invité" dont la part est suivie manuellement, réglée hors app).
- Reconnaître un membre sans compte d'un groupe à l'autre : sans e-mail, il
  n'y a rien à comparer entre deux profils — créer "Avana" dans un nouveau
  groupe créerait donc toujours un nouveau profil, même si un "Avana" sans
  compte existe déjà dans un autre groupe. Pour limiter ce risque de
  doublon, "+ ajouter un membre" (depuis "gérer les membres") ET le
  formulaire d'invités à la création d'un groupe suggèrent tous les deux,
  dès 2 caractères tapés dans le prénom et tant qu'aucun e-mail n'est
  renseigné, les profils sans compte déjà créés par l'utilisateur courant
  dans d'autres groupes (`profiles.created_by`) — un clic lie ce profil
  existant (avec sa part actuelle) au lieu d'en recréer un. Ça
  reste un pense-bête (limité aux profils créés par l'utilisateur courant,
  pas ceux créés par un autre admin) : la solution robuste reste de
  renseigner un e-mail dès qu'une personne est amenée à apparaître dans
  plusieurs groupes.
- Chaque groupe a sa propre devise, choisie à sa création, utilisée pour son
  détail, ses suggestions d'équilibrage et ses dépenses (y compris listées
  dans l'onglet "toutes les dépenses"). Un filtre par groupe est disponible
  sur l'accueil, la page dépenses et la fiche personne pour voir le détail
  d'un seul groupe dans sa devise. En vue agrégée ("tous les groupes"), si
  les groupes du compte n'utilisent pas tous la même devise, un message
  invite à filtrer par groupe plutôt que d'afficher un total qui
  additionnerait des devises différentes. En vue agrégée (tous les groupes
  partagent la même devise), c'est cette devise commune qui est utilisée,
  pas un symbole câblé en dur. La liste des devises proposées à la création
  d'un groupe (`scripts/data.js`) couvre en priorité les monnaies
  africaines (public cible principal de l'app), en plus des devises
  internationales usuelles. Chaque montant affiché sépare les milliers
  (convention française) et n'affiche des décimales que pour les devises
  qui en utilisent couramment au quotidien — la plupart des francs
  africains (FCFA, Ariary, franc guinéen, rwandais...) s'affichent donc
  sans décimales.
- Une dépense peut être payée dans une devise différente de celle du groupe
  (ex. billet d'avion payé en euros dans un groupe suivi en ariary, cf.
  migration `0019_expense_currency_conversion.sql`) : `expenses.amount`
  continue de représenter le montant dans la devise du groupe (aucun
  changement pour `scripts/calc.js`) ; `original_currency`/`original_amount`/
  `exchange_rate` ne sont que des métadonnées d'affichage et d'historique,
  figées au moment de la dépense (jamais recalculées après coup, même si le
  taux du jour ou le taux "gelé" du groupe changent ensuite). Le taux est
  pré-rempli automatiquement via une API de change gratuite et sans clé
  (`@fawazahmed0/currency-api`, servie depuis jsdelivr — déjà un CDN de
  confiance ici), mais toujours modifiable, et retombe sur une saisie
  manuelle si la requête échoue (hors ligne, devise non supportée...). Un
  groupe peut activer "geler les taux de change" pour réutiliser le dernier
  taux connu d'une devise plutôt que d'aller en rechercher un nouveau à
  chaque dépense (table `group_currency_rates`, un taux par devise et par
  groupe).
- Dans le détail d'un groupe, les membres qui partagent un même foyer sont
  fusionnés en une seule ligne consolidée (payé/part/solde sommés, noms
  listés en sous-titre) plutôt que d'apparaître individuellement ; les
  suggestions de règlement ("pour équilibrer") sont pareillement consolidées
  par foyer (un règlement entre deux membres d'un même foyer devient interne
  et n'est plus suggéré). Le moteur de calcul (`calc.js`) continue de
  travailler personne par personne — cette consolidation est purement un
  regroupement d'affichage. Un bouton "par foyer / par membre" (uniquement
  quand au moins un foyer regroupe effectivement plusieurs membres du
  groupe, sinon les deux vues seraient identiques) partagé par le tableau
  "payé/part/solde" et par "pour équilibrer" bascule les deux entre vue
  consolidée par foyer et détail personne par personne. Le tableau
  "payé/part/solde" affiche désormais un en-tête par colonne (au lieu d'un
  seul libellé combiné au-dessus de toute la table) pour qu'on distingue
  sans ambiguïté quel nombre correspond à quoi.
- Chaque suggestion de règlement ("pour équilibrer", groupe ou "tous les
  groupes") propose un raccourci pour enregistrer directement le paiement
  correspondant, sans passer par la fiche personne. Absent quand la
  suggestion concerne un foyer consolidé (payer "pour" un foyer de
  plusieurs personnes serait ambigu — qui règle concrètement ?) : dans ce
  cas, bascule en vue "par membre" pour régler individuellement.
- Un membre non-admin peut quitter un groupe lui-même ("quitter ce groupe"
  dans le détail du groupe) ; comme pour un retrait par l'admin, un solde non
  réglé reste dû et affiché tant qu'il n'est pas soldé. Seul l'admin peut
  réintégrer quelqu'un ensuite (depuis "gérer les membres").
- Le sélecteur "connecté en tant que" du prototype de design a été retiré :
  avec de vrais comptes, on ne peut plus impersonner un autre utilisateur
  côté client — chacun se connecte avec ses propres identifiants (mot de
  passe ou lien magique).
- Chaque dépense peut avoir un reçu/pièce jointe (photo ou PDF), facultatif,
  ajouté ou remplacé depuis la même modale qu'à la création/modification.
  Stocké dans un bucket Supabase Storage privé (pas d'URL publique) : la
  consultation passe par une URL signée à durée limitée, dans le même esprit
  que le reste de l'app où RLS est la vraie frontière de sécurité, pas le
  secret d'une URL.

## Ce qui est fidèle au design, ce qui reste à faire

- **P0 — fait** : vrai backend d'auth (Supabase Auth — mot de passe, lien
  magique, et création de compte), vraie base de données Postgres avec RLS
  (remplace `localStorage`), vrai flux d'invitation par e-mail pour rejoindre
  un groupe, foyers + personnes à charge + parts pondérées (édition de la
  part et du responsable depuis "gérer les membres"), vues consolidées par
  foyer dans le détail d'un groupe, possibilité pour un membre non-admin de
  quitter un groupe. Cf. `supabase/README.md` pour la configuration du
  projet.
- **P1 — important** : notifications de relance réelles (push — nécessite
  l'enregistrement d'un token device par utilisateur et un service d'envoi
  type Firebase Cloud Messaging / APNs), optimisation avancée des
  remboursements, profils de répartition réutilisables, dépenses partielles
  par foyer, simplification des dettes à l'échelle du compte (actuellement
  groupe par groupe uniquement).

## Audit de cohérence (comparatif Splitwise / Tricount)

Une analyse de cohérence de l'app a été menée en la confrontant à Splitwise
et Tricount, en tenant compte des spécificités du brief (foyers, personnes à
charge, parts pondérées). Statut des points relevés :

**Incohérences corrigées**

| Constat | Statut |
|---|---|
| Rappel de paiement / règlement / fiche personne ignoraient le filtre par groupe (le montant utilisé ne correspondait pas à celui affiché à l'écran) | ✅ corrigé |
| La vue agrégée "tous les groupes" additionnait des montants de devises différentes sans conversion, sous un symbole fixe | ✅ corrigé — message dédié dès que les groupes du compte utilisent des devises différentes |
| Retirer un membre d'un groupe faisait disparaître son solde non réglé du tableau | ✅ corrigé — reste affiché, marqué "ex-membre", tant qu'il n'est pas soldé |
| "Personne à charge" présentée comme un 3e "type" au même niveau qu'Adulte/Enfant | ✅ corrigé — `participant_type` retiré ; la prise en charge est un badge calculé à partir du responsable, indépendant de toute catégorie |
| "+ ajouter une dépense" ciblait toujours le premier groupe créé, pas le dernier consulté | ✅ corrigé |
| L'accueil affichait toujours "€" (devise câblée en dur) même quand tous les groupes du compte utilisent une autre devise (ex. Ar) — incohérent avec la page Groupes, qui affiche la bonne devise | ✅ corrigé — l'accueil (et les autres vues agrégées) reprend la devise commune des groupes du compte |

**Gains rapides livrés**

| Amélioration | Statut |
|---|---|
| Catégories de dépenses avec icônes (courses, repas, logement, transport, loisirs, santé, autre) | ✅ fait |
| Recherche texte sur la page dépenses (libellé, payeur, groupe) | ✅ fait |
| Bouton "créer un groupe" visible directement sur l'accueil vide | ✅ fait |
| Terminologie "coefficient" renommée en "part" (plus parlant pour un usage non technique) | ✅ fait |
| Pièce jointe/reçu par dépense (photo ou PDF, stockage privé + URL signée) | ✅ fait |
| Devises africaines dans le choix de devise (public cible principal de l'app), pas seulement EUR/USD/GBP/CHF/CAD | ✅ fait |
| Séparateur de milliers sur tous les montants ; décimales masquées pour les devises qui n'en utilisent pas couramment (la plupart des francs africains) | ✅ fait |
| Thème par défaut : clair (au lieu de sombre), plus adapté à un premier lancement en plein jour | ✅ fait |
| Suggestion de profils sans compte existants en tapant un prénom dans "ajouter un membre" ET dans le formulaire d'invités à la création d'un groupe (évite de recréer un doublon d'une personne déjà membre d'un autre groupe) | ✅ fait |
| Casse du texte de l'interface incohérente (titres de page, boutons, messages en minuscule alors que certains messages ponctuels étaient déjà en casse classique) | ✅ fait — casse classique (majuscule initiale) partout, y compris les titres de page, boutons, libellés de champ, placeholders et messages ; hérité tel quel du prototype de design d'origine, sans lien avec un design system imposant le tout-minuscule |
| Pas de moyen rapide de cocher/décocher tous les membres sous "Qui participe ?" (formulaire dépense) | ✅ fait — lien "Tout sélectionner" / "Tout désélectionner" qui s'inverse selon que tous les membres du groupe sont déjà cochés ou non |
| Aucun moyen de filtrer la page "toutes les dépenses" pour ne voir que ce qui concerne réellement l'utilisateur (payeur ou participant) — utile pour repérer rapidement une dépense mal attribuée | ✅ fait — pastille "Me concerne uniquement" au-dessus de la recherche, cumulable avec elle |
| Aucun moyen de filtrer par catégorie ni de trier par date/montant sur la page "toutes les dépenses" (seul le tri par date décroissante était possible, non modifiable) | ✅ fait — pastilles de catégorie (n'apparaissent que si le groupe/compte a des dépenses d'au moins 2 catégories différentes) + menu déroulant de tri (plus récentes/anciennes, montant croissant/décroissant), cumulables avec la recherche et "me concerne uniquement" |
| Une seule façon de répartir une dépense (poids permanent du profil) — Splitwise en propose plusieurs, sur demande explicite de comparaison | ✅ fait — 4 modes ponctuels en plus du mode par défaut, choisis pour une dépense précise sans toucher au poids permanent du profil : "Équitable" (parts strictement égales), "Part ponctuelle" (poids ponctuel), "Montant exact" et "Pourcentage" (avec indicateur "reste à répartir" en direct et blocage de l'enregistrement tant que la somme ne correspond pas). Migration additive (`split_mode`/`split_value`), rétrocompatible à 100 % — toute dépense existante garde le comportement d'origine |
| "Envoyer un rappel" n'était que déclaratif : une ligne enregistrée dans `reminders`, sans notification réelle envoyée à la personne concernée | ✅ fait — nouvelle Edge Function `send-reminder` (cf. `supabase/README.md`) : enregistre le rappel comme avant, et tente en plus un vrai e-mail (Resend) si le destinataire a un compte avec une adresse connue. Dégrade proprement (rappel quand même enregistré) si la personne est un invité sans compte, ou si aucune clé Resend n'est configurée — comportement d'avant inchangé dans ces deux cas. Notification push explicitement écartée pour l'instant (chantier bien plus lourd : service worker, clés VAPID, autorisation navigateur) |
| Audit UX/UI global des listes/pastilles qui risquent de prendre trop de place à mesure qu'elles grandissent (groupes, "payé par", "gérer les membres", historique...) | ⏳ audit fait (cf. section ci-dessous) — seule la recherche sur "gérer les membres" a été demandée pour l'instant : ✅ fait, une recherche par prénom filtre les cartes membres (au-delà de 5 membres), sans affecter les menus déroulants (responsable/foyer) qui continuent de lister tout le monde |
| Impossible de renseigner l'e-mail d'un invité après coup si non saisi à l'ajout — bloquait notamment l'envoi d'un vrai rappel par e-mail (cf. ligne précédente) | ✅ fait — champ e-mail éditable dans "gérer les membres", uniquement pour les profils sans compte (un compte réel garde son e-mail lié à sa connexion Supabase Auth, non modifiable depuis l'app pour éviter toute désynchronisation) |
| "Envoyer un rappel" partait directement au clic, sans rien indiquer si le destinataire n'avait pas d'e-mail connu (donc sans possibilité réelle de vérifier si un e-mail serait bien envoyé) | ✅ fait — le clic ouvre désormais une fenêtre de confirmation : message qui sera envoyé, mention explicite si aucun e-mail n'est connu, et pour un invité sans compte, un champ pour en ajouter un sur place avant d'envoyer (enregistré automatiquement juste avant le rappel) |
| Quand l'e-mail de rappel n'était pas envoyé (clé Resend non chargée, domaine non vérifié...), le toast restait muet sur la raison — obligeait à aller lire les logs de la Edge Function pour diagnostiquer | ✅ fait — le toast affiche désormais directement la raison ("clé Resend absente côté serveur", ou le message d'erreur renvoyé par Resend) |
| Rien n'empêchait deux profils sans compte de partager la même adresse e-mail (renseignée après coup via "gérer les membres") — gênant pour distinguer les rappels de deux personnes différentes, et risqué pour le dédoublonnage de `invite-member` | ✅ fait — contrainte unique en base sur `profiles.email` (migration 0011, `NULL` toujours autorisé en plusieurs exemplaires) + message clair si on tente d'enregistrer un doublon |
| Sur mobile, fond noir visible autour/derrière l'app, et menu du bas qui ne reste pas au bord réel de l'écran | ✅ fait — cause racine commune : `.app-frame` avait une hauteur fixe (840px, pensée comme une "carte" desktop) qui ne correspond à aucun vrai viewport mobile. L'app occupe désormais tout l'écran par défaut (100dvh, avec repli 100vh), sans marge ni carte flottante. `data-theme` est aussi désormais porté par `<html>` (pas seulement `.app-frame`), pour que le fond de `<body>` corresponde toujours au thème actif |
| Effet de flash lors de la saisie réapparu une 3e fois (après le correctif initial, puis le debounce sur les champs prénom) sur d'autres champs | ✅ fait — corrigé cette fois à la cause racine plutôt qu'au cas par cas : la transition CSS globale (`background-color`/`border-color`) rejouait sur les nœuds recréés à chaque re-rendu complet ; elle est désormais désactivée le temps du remplacement du DOM puis réactivée à la frame suivante, quel que soit le champ ou le type de mise à jour d'état utilisé |
| Sur desktop, l'app donnait l'impression d'une appli mobile agrandie (carte étroite en 9:16, flottante avec ombre) plutôt que d'un vrai site pensé pour un écran large | ✅ fait — à partir de 900px de large, plus de "carte" du tout : plein écran comme sur mobile, mais navigation réorganisée en menu latéral fixe (façon Gmail/Notion) et colonne de contenu à largeur de lecture confortable (720px, centrée) plutôt qu'étirée sur tout l'écran. En dessous de ce seuil, comportement mobile inchangé (menu du bas). Les modales gardent aussi une largeur de formulaire raisonnable (plus d'étirement sur toute la largeur d'un écran large) |
| Sur mobile, le menu du bas "suivait" le scroll en laissant un espace vide entre lui et le vrai bord de l'écran (au lieu de rester collé au bord comme sur une app native, cf. tiakaly.com) | ✅ fait — cause racine : le menu était en `position: absolute` par rapport à `.app-frame`, dont la hauteur (100dvh) se recalcule en layout à chaque apparition/disparition de la barre d'adresse du navigateur, avec un temps de retard sur l'animation de cette barre. Passé en `position: fixed` (ancré directement au viewport visuel), il colle désormais instantanément au bas réel de l'écran, sans décalage |
| Aucune petite animation de célébration nulle part dans l'app (ex : quand une dette est soldée) | ✅ fait — petite explosion de confettis (lib `canvas-confetti`, CDN, ~3 Ko) au moment où un paiement est enregistré avec succès (`submitSettle`), aux couleurs de la marque. Respecte `prefers-reduced-motion` (désactivée automatiquement si l'utilisateur a demandé moins d'animations) et échoue silencieusement si la lib n'a pas pu se charger, sans jamais bloquer l'enregistrement du paiement lui-même |
| Sur desktop, le contenu de la page de connexion se retrouvait plaqué à droite au lieu d'être centré | ✅ fait — cause racine : `.login-screen` (et l'écran de chargement) n'avaient pas de `grid-area` attribué dans la grille desktop (introduite pour le menu latéral), donc la grille les casait par défaut dans la première cellule libre (la colonne de 240px prévue pour le menu). Plutôt que de juste recentrer le même formulaire étroit, le formulaire de connexion est désormais présenté comme une vraie carte centrée à l'écran (largeur 400px, ombre, coins arrondis) — le classique d'une page de connexion desktop (Notion, Linear...). Comportement mobile inchangé |
| "Part" (poids permanent d'un membre) et "Part ponctuelle" (poids valable pour une seule dépense) portaient presque le même nom, sans indiquer lequel est permanent et lequel est temporaire | ✅ fait — le réglage permanent est renommé "Part habituelle" partout (fiche membre, ajout d'un membre, formulaire de création de groupe), pour faire écho naturellement à "Part ponctuelle" |
| La zone d'ajout de pièce jointe utilisait le `<input type="file">` natif du navigateur, au rendu brut et incohérent avec le reste des champs de l'app | ✅ fait — remplacée par une zone cliquable en pointillés façon "+ Ajouter" (cohérente avec le reste du design), et par une puce avec nom de fichier + bouton pour en choisir un autre une fois un fichier sélectionné. L'`<input type="file">` reste bien présent et fonctionnel (accessible au clavier, ouvre le bon sélecteur photo/PDF sur mobile), seul son style par défaut est masqué |
| Identité visuelle définitive (brand sheet fournie par l'utilisateur : logo + palette de couleurs) pas encore appliquée à l'app | ✅ fait — logo (motif tissé, géométrie reprise fidèlement de la brand sheet) sur l'écran de connexion et de nouveau mot de passe, et comme favicon (icône d'onglet, SVG intégré en data URI, pas de fichier séparé à héberger). `--brand-primary` passe du violet au rose de la marque (`#D6247A` en thème clair, légèrement éclairci en `#E04891` pour le thème sombre afin de garder un contraste suffisant sur fond sombre — même logique déjà appliquée aux couleurs de statut) et `--brand-secondary` passe au vert de la marque (`#0F8F6B`, identique dans les deux thèmes, déjà suffisamment contrasté). Comme ces deux couleurs sont des variables CSS globales, tous les boutons/liens/icônes de marque et l'explosion de confettis (qui lit ces mêmes variables) suivent automatiquement le nouveau rendu. Le violet et le doré de la palette (utilisés uniquement dans des variantes du logo sur la brand sheet) ne sont pas câblés ailleurs dans l'app — pas d'usage identifié qui le justifie pour l'instant |
| Le logo n'apparaissait que sur les écrans de connexion, pas dans l'app une fois connecté | ✅ fait — sur mobile, le logo remplace le bouton retour dans la barre du haut, mais uniquement sur les écrans de premier niveau (accueil, groupes, dépenses, historique) qui n'ont pas de bouton retour à cet emplacement. Sur desktop, il apparaît une seule fois, en en-tête du menu latéral (toujours visible, façon Gmail/Notion) — masqué dans la barre du haut à cette largeur pour ne pas dupliquer la marque sur le même écran |
| La page d'accueil méritait un traitement plus marquant que la simple icône unie utilisée sur les autres écrans | ✅ fait — l'écran "Accueil" affiche désormais le logo dans sa variante multicolore (une couleur différente par rectangle, reprise fidèlement de la brand sheet) accompagné du wordmark "Rohy", à la place du titre "Mes dépenses", mais uniquement sur mobile. Les autres écrans de premier niveau (Groupes, Dépenses, Historique) gardent l'icône unie simple |
| Sur desktop, le logo apparaissait deux fois sur l'écran d'accueil (menu latéral + barre du haut) | ✅ fait — cause racine : le wordmark multicolore de l'accueil (cf. ligne précédente) n'était pas désactivé à partir de 900px de large, alors que le menu latéral affiche déjà la marque en permanence à cette largeur. La barre du haut de l'accueil revient désormais à un titre texte simple ("Mes dépenses") sur desktop, exactement comme les autres écrans — le wordmark coloré reste réservé au mobile, là où il n'y a pas de menu latéral pour faire doublon |
| Le favicon (rose plein + motif crème) devenait une tache floue à peine lisible à la taille réelle d'un onglet de navigateur (16-32px) | ✅ fait — inversé : fond crème (`--surface-canvas`) + motif en rose de la marque avec un contour plus foncé, qui se détache beaucoup plus nettement à cette échelle (vérifié en simulant un onglet de navigateur à taille réelle avant/après) |

**Bugs supplémentaires trouvés et corrigés en creusant l'audit**

| Bug | Statut |
|---|---|
| Montant du rappel de paiement toujours à 0,00 (inversion de signe présente depuis l'origine de la fonctionnalité) | ✅ corrigé |
| "Enregistrer un paiement" (fiche personne) affichait le sens du règlement inversé (ex. "Y → moi" alors que c'est moi qui dois à Y) — le calcul de `from`/`to` dans `openSettle` était exactement inversé par rapport à `pairNet` | ✅ corrigé |
| "Gérer les membres" affichait tous les comptes existants du compte, pas seulement ceux du groupe ouvert | ✅ corrigé |
| Perte de la position de scroll dans les modales après un rechargement de données (donnait l'impression qu'un changement n'était pas enregistré) | ✅ corrigé |
| Message d'erreur générique de `invite-member` ("Edge Function returned a non-2xx status code") au lieu du vrai motif d'échec | ✅ corrigé |
| Invitations envoyées en parallèle à la création d'un groupe, peu robuste | ✅ corrigé — désormais séquentielles, avec possibilité de réessayer depuis "gérer les membres" |
| Aucun moyen d'ajouter un nouveau membre après la création du groupe | ✅ corrigé — "+ ajouter un membre" dans "gérer les membres" (e-mail facultatif) |
| Simplification des dettes calculée groupe par groupe uniquement, ce qui pouvait suggérer des transactions redondantes entre deux mêmes personnes partageant plusieurs groupes | ✅ corrigé — section "pour équilibrer (tous les groupes)" sur l'accueil (vue agrégée, devise commune), qui réutilise `computeDebts()` (déjà fusionné par paire indépendamment du groupe) + `simplify()` sur l'ensemble des membres ; la section "pour équilibrer" de chaque groupe reste utile pour régler ce groupe précisément |
| Montant total peu lisible (gris clair) sur la page "toutes les dépenses" | ✅ corrigé (patch ponctuel, puis cause racine identifiée et corrigée séparément, cf. ligne suivante) |
| Cause racine trouvée en creusant le bug précédent : `data-theme` est porté par `.app-frame`, pas par `<body>` — tout texte sans couleur propre héritait donc du `color` de `<body>`, résolu hors du scope de thème (toujours les valeurs du thème sombre, quel que soit le thème actif). Invisible tant que le thème sombre était celui par défaut, ce bug rendait illisible tout texte "nu" en thème clair (ex. "xxx Ar restent à verser à des tiers") | ✅ corrigé — `color: var(--text-primary)` explicite sur `.app-frame`, qui porte déjà `data-theme` |
| Couleurs d'accent (montants positifs en vert, avertissements en doré, badges en rouge) trop claires sur fond clair (ratio de contraste ~2.5–3.8, sous le seuil WCAG AA de 4.5) | ✅ corrigé — teintes assombries en thème clair (`--status-positive`/`--status-warning`/`--status-danger`/`--brand-secondary`), même teinte conservée |
| Sélecteur de devise à la création d'un groupe : une ligne de pastilles pour ~35 devises prend toute la page | ✅ corrigé — remplacé par un menu déroulant |
| Le formulaire d'invités à la création d'un groupe exigeait toujours un e-mail valide (`submitGroup`), alors que "gérer les membres" avait déjà rendu l'e-mail facultatif — incohérence entre les deux points d'entrée pour ajouter un membre | ✅ corrigé — même règle partout : un invité sans e-mail est ajouté directement comme profil sans compte |
| Export des données (CSV/Excel/PDF), initialement noté hors périmètre dans la spec de hand-off | ✅ fait, sur demande explicite — un groupe expose désormais un export CSV/Excel/PDF (fiche groupe, sous "Exporter"), contenant les dépenses détaillées et les soldes/transactions à effectuer ; généré entièrement côté client (ExcelJS pour le .xlsx, jsPDF + autotable pour le .pdf), sans aucun appel serveur. Le format PPT initialement envisagé a été écarté après clarification (peu pertinent pour ce cas d'usage) |
| Les exports Excel et PDF étaient de simples tableaux bruts, sans aucune identité visuelle (pas de logo, pas de couleurs de marque) | ✅ fait — les deux exports intègrent désormais le logo (image PNG rastérisée à la volée depuis le SVG de la marque, pas juste un mot en toutes lettres) et reprennent les couleurs de marque : en-tête "Rohy" en rose, lignes d'en-tête de tableau roses à texte blanc, lignes alternées teintées crème. Changement de bibliothèque pour le .xlsx : SheetJS (`xlsx`), utilisé jusqu'ici, ne sait pas écrire de styles de cellules ni intégrer d'image dans son édition gratuite — remplacé par **ExcelJS** (également gratuit), qui sait faire les deux. Vérifié en générant réellement les deux fichiers (pas seulement en relisant le code) : fichier .xlsx désassemblé pour confirmer la présence du logo intégré et des couleurs, PDF rendu en image pour confirmer visuellement la mise en page |
| Export PDF : le séparateur de milliers des montants (espace fine insécable U+202F, produite par `toLocaleString('fr-FR')`) s'affichait comme un "/" — absente de la police Helvetica intégrée à jsPDF | ✅ corrigé — remplacée par une espace normale, uniquement dans le rendu PDF (`fmtIn` reste inchangé partout ailleurs, où le rendu navigateur l'affiche correctement) |

**Reste à faire / différé**

| Piste | Statut |
|---|---|
| Montant ou pourcentage exact par personne sur une dépense, au-delà du poids relatif | ✅ fait — cf. ligne "modes de répartition" ci-dessus (recoupait la Fonctionnalité 8 du brief) |
| Optimisation avancée des remboursements (au-delà de la simplification gloutonne actuelle) | ⏳ différé — Fonctionnalité 9 du brief, Étape 2 |
| Dépenses récurrentes | ⏳ différé — hors brief actuel, à arbitrer |
| Notification push pour les rappels (en plus de l'e-mail) | ⏳ différé — chantier à part (service worker, clés VAPID, autorisation navigateur) |
| Animation d'accueil juste après connexion (login/inscription) | ✅ fait — écran de lancement animé (motif de la marque qui s'assemble par groupes de bandes, aux couleurs de la variante multicolore), affiché à chaque démarrage de l'app pendant ~3,2s. Le wordmark "Rohy" et la baseline apparaissent en fondu juste après, le temps d'être lus avant que l'écran ne disparaisse. La connexion/le chargement des données continuent en parallèle pendant ce délai (pas d'attente supplémentaire une fois l'écran retiré) |
| Le menu du bas se retrouvait parfois caché derrière la barre du navigateur mobile lui-même (barre d'outils ancrée en bas, barre de navigation gestuelle Android, certains navigateurs intégrés) | ⚠️ tentative : `100dvh` seul ne retire pas toujours correctement cette zone de l'écran selon le navigateur/contexte. Premier correctif via `window.visualViewport` (variable CSS `--app-vh`) — insuffisant, le problème est revenu sur un appareil réel (Chrome iOS) |
| Le correctif précédent (`--app-vh` via `visualViewport`) ne suffisait pas : la barre d'outils du navigateur restait parfois invisible pour `visualViewport` lui-même, revenant au même défaut | ✅ fait — remplacé par `100svh` (unité de viewport "small", qui suppose toujours le chrome du navigateur affiché au maximum) comme dernier repli, à la place du calcul en JavaScript. Par définition jamais trop grande, donc jamais susceptible de cacher le menu du bas derrière une barre du navigateur, au prix — dans de rares cas — de ne pas profiter du plein espace quand ce chrome disparaît. Plus simple aussi : supprime le code JS et les écouteurs d'évènements devenus inutiles |
| Bug découvert en testant l'écran de lancement : une déconnexion (ou plus généralement toute perte de session) réinitialisait l'état via `defaultState()`, qui remet `showSplash` à `true` — sans qu'aucun minuteur ne le désactive plus jamais ensuite (le seul minuteur tourne une fois, au tout premier chargement de la page). Un utilisateur qui se déconnectait restait donc bloqué sur l'écran de lancement indéfiniment | ✅ corrigé avant que le bug ne se propage |
| Second bug introduit par le correctif précédent : forcer `showSplash: false` inconditionnellement dans ce même branchement (session absente) supprimait aussi l'écran de lancement pour toute personne jamais connectée — ce même événement (session absente) se déclenche en effet aussi bien après une vraie déconnexion qu'au tout premier contrôle d'auth d'une visite fraîche, sans session à restaurer. Résultat : plus personne ne voyait jamais l'écran de lancement | ✅ corrigé — `showSplash` n'est forcé à `false` que si `state.loggedIn` était vrai juste avant ce reset (signe d'une vraie déconnexion) ; sinon la valeur en cours est conservée, laissant l'écran de lancement suivre son cours normal. Revérifié avec les deux scénarios distincts (visite fraîche sans session vs. déconnexion réelle depuis l'app) |
| Partage du lien de l'app sur les réseaux sociaux/en message : aucun aperçu (pas de titre, description ou image, juste l'URL nue) | ✅ fait — balises Open Graph et Twitter Card dans `index.html` (titre, description, image). L'image d'aperçu (`assets/og-image.png`, 1200×630, logo + wordmark + accroche) est un fichier généré une fois et commité, pas une image de la brand sheet réutilisée telle quelle. `og:url`/`og:image` pointent maintenant vers le domaine définitif `rohy-app.com` (URL absolues, nécessaires pour la plupart des plateformes de partage) |
| Le logo n'apparaissait qu'en icône seule sur la page de connexion (pas de wordmark) | ✅ fait — le mot "Rohy" apparaît maintenant à côté de l'icône sur la page de connexion et celle de nouveau mot de passe, sur mobile comme sur desktop (revu après un premier essai desktop-only). Le reste de l'app (menu, écrans de premier niveau) garde son traitement propre — ce wordmark-là (`.login-wordmark`) n'est utilisé que sur ces deux écrans de connexion |
| Pas de page "À propos" dans l'app | ✅ fait — nouvel écran (logo multicolore + wordmark, description de l'app), accessible depuis "Mon compte" → "À propos". Utilise la navigation standard de l'app (bouton retour, pile de navigation) plutôt qu'une fenêtre modale, pour un vrai écran à part entière. Contenu ensuite enrichi avec le texte de présentation fourni (positionnement, sens du nom "Rohy" en malgache, liste des fonctionnalités, origine à Madagascar) — structuré en sections titrées avec un fil de lecture aligné à gauche (plus lisible qu'un bloc centré pour un texte de cette longueur), le bloc d'en-tête (logo/nom/accroche) restant centré |
| Ajout d'une dépense entièrement manuel, sans moyen de gagner du temps sur la saisie | ✅ fait — bouton "Scanner un ticket" en haut du formulaire d'ajout de dépense : une photo du ticket (prise sur le moment ou choisie dans la pellicule) est envoyée à une nouvelle Edge Function (`scan-receipt`) qui la fait lire par un modèle de vision (Claude/Anthropic) et pré-remplit libellé, montant et date — tous les champs restant modifiables avant d'enregistrer. La photo devient aussi automatiquement le reçu joint à la dépense (pas besoin de la fournir une deuxième fois plus bas). Dégrade proprement (toast d'erreur clair, formulaire vide mais toujours utilisable à la main) si la clé API n'est pas configurée ou si la lecture échoue — cf. `supabase/README.md` section 6 pour le déploiement |
| "Mon compte" (et donc la déconnexion) n'était accessible que depuis l'écran d'accueil ("Connecté en tant que..."), invisible et injoignable depuis les autres écrans | ✅ fait, après confrontation aux conventions habituelles (avatar de profil fixe dans l'en-tête sur mobile, ancré en bas du menu latéral sur desktop — façon Gmail/Slack/Notion) — icône de compte désormais toujours visible : dans la barre du haut sur mobile (sur tous les écrans, pas seulement l'accueil), ancrée en bas du menu latéral sur desktop (séparée des liens de navigation principaux par une bordure, comme Slack/Discord). Chacune masquée sur l'autre format pour ne pas dupliquer ce point d'accès. La ligne "Connecté en tant que" de l'accueil reste en place (contexte utile sur ce point d'entrée précis), sans redondance gênante avec le nouveau point d'accès permanent |
| Paiement mobile money intégré (MVola / Orange Money / Airtel Money), avec mise à jour automatique du solde une fois le règlement effectué | ⏳ différé pour la partie automatique — chaque opérateur exige un accord marchand (souvent via une entreprise enregistrée, avec frais), ou en passant par un agrégateur ayant déjà ces accords (ex. Manda, PaidMada, Efaina, PayBriq, Papi, Voaray — solutions locales à Madagascar avec API unifiée). Une fois l'accès obtenu, ça change le profil de risque de l'app (webhooks à sécuriser, idempotence, réconciliation, paiements partiels/échoués). ✅ fait pour la piste intermédiaire sans dépendance externe (cf. migration `0014_payment_method_reference.sql`) : le formulaire de règlement propose désormais le choix du moyen utilisé (MVola/Orange Money/Airtel Money/Espèces/Autre) + un bouton qui ouvre directement le clavier téléphone avec le code USSD de l'opérateur pré-rempli (`tel:*111#` etc. — fonctionne même sans l'app de l'opérateur installée, puisque ça passe par le réseau, pas par une app) + un champ pour la référence de transaction. Le règlement reste entièrement déclaratif (aucun webhook de confirmation n'existe sur ce canal), mais avec une vraie trace. Codes USSD à vérifier par l'équipe Rohy avant usage réel — ceux du code sont les plus courants connus pour Madagascar mais pas garantis à 100 % stables dans le temps |
| Sur l'écran de lancement, les bandes glissaient en ligne droite jusqu'à leur place — un simple mouvement de translation, sans rappeler le tissage du motif final | ⚠️ tentative initiale : ondulation perpendiculaire à la trajectoire pour évoquer un fil qui serpente — jugée peu convaincante à l'usage (mouvement hésitant, ne se lit pas vraiment comme un tissage) et remplacée par l'approche ci-dessous |
| Après retour sur l'animation (mouvement hésitant, effet de tissage pas convaincant, animation trop longue, et bandes dont le contour apparaissait vide avant que la couleur ne le remplisse) | ✅ refait entièrement — chaque bande s'assemble désormais à sa place (échelle avec léger dépassement, sans va-et-vient) plutôt que de parcourir une longue distance : plus net et plus confiant, et honnête sur ce qu'une transformation 2D peut représenter (un vrai passage par-dessus/en-dessous demanderait de faire alterner l'ordre d'empilement des bandes). Bandes verticales puis horizontales révélées par groupes (léger décalage à l'intérieur d'un groupe, décalage plus net entre les deux groupes) : chaque étape intermédiaire montre un ensemble de couleurs cohérent, jamais une bande isolée qui jure avec le reste. Contour et remplissage de chaque bande horizontale partagent désormais le même délai — le contour vide visible avant l'arrivée de sa couleur (bug de l'ancienne version) a disparu. Animation totale ramenée de ~4s à ~1,1s (durée de l'écran de lancement ajustée en conséquence, de 5s à 3,2s). Vérifié image par image (Playwright, thèmes clair et sombre) : pas de bande isolée disgracieuse à aucune étape, motif final identique au logo statique |
| Pendant l'assemblage, la bordure d'une bande restait visible par transparence lorsqu'elle passait sous une autre (ex. la bordure violette perçait à travers la bande rose encore en cours de fondu) | ✅ fait — cause : le fondu d'opacité (0→1) utilisé pour faire apparaître chaque bande la rendait semi-transparente pendant toute la transition, laissant deviner ce qu'elle est censée recouvrir. Le fondu d'opacité est retiré, ne reste que l'échelle (une bande à l'échelle 0 est invisible car sans taille, pas parce qu'elle est transparente) : à tout instant, une bande est soit absente, soit pleinement opaque, donc masque proprement ce qu'elle recouvre dès qu'elle l'atteint. Vérifié par comparaison directe (captures pendant la transition, avant/après le correctif) : plus aucun mélange de couleurs visible à aucune étape |
| Le problème persistait quand même sur mobile (Chrome iOS, donc moteur WebKit comme Safari) alors qu'il était corrigé partout ailleurs | ⚠️ tentative : hypothèse d'un souci de calcul de boîte englobante propre à WebKit pour `transform-box: fill-box` sur les éléments `<path>` — remplacé par un point d'origine en coordonnées explicites. Cette piste s'est avérée fausse (cf. ligne suivante), mais le changement reste en place (il est de toute façon plus robuste, sans dépendre d'aucun calcul de boîte englobante) |
| Capture d'écran fournie de l'état final (animation terminée) : en fait pas un bug de rendu du tout — la bande verticale révélée à chaque croisement (par le trou du tracé evenodd d'une bande horizontale) garde sa propre bordure tout du long de sa hauteur, y compris dans cette fenêtre de révélation, ce qui casse le patch de couleur en un rectangle à part avec son propre contour au lieu d'un aplat homogène | ✅ fait — un pavé plein (sans bordure), à la couleur de la bande verticale concernée, est posé par-dessus chacune des 4 fenêtres de croisement (calculées à partir des mêmes coordonnées que les découpes evenodd existantes), animé en même temps que la bande horizontale correspondante. Masque la bordure superflue sans changer la couleur perçue. Le logo statique utilisé ailleurs (accueil, À propos, favicon) n'a pas ce défaut — il découpe déjà ses bandes horizontales en segments qui recouvrent tout juste le débord de bordure de la verticale — seul le tracé de l'écran de lancement (technique différente, trou evenodd) en avait besoin |
| L'icône affichée sur les tuiles "Raccourcis" de la page nouvel onglet de Chrome (et plus généralement partout où un navigateur affiche une icône de raccourci plus grande que le favicon) n'avait qu'un minuscule favicon SVG à agrandir, souvent flou ou remplacé par un rond de couleur avec une initiale | ✅ fait — ajout d'un manifeste web (`manifest.json`) référençant des icônes PNG dédiées à 192×192 et 512×512 (`assets/icon-192.png`, `assets/icon-512.png`, générées depuis le même motif que le favicon), plus une icône `apple-touch-icon` (180×180) pour l'équivalent iOS/Safari ("Ajouter à l'écran d'accueil"). `display: "browser"` dans le manifeste (pas `standalone`) pour ne pas suggérer une installation en app, en l'absence de service worker — seul le choix d'une icône plus grande était demandé |
| "Connecté en tant que X" sur l'accueil : phrase de statut technique, redondante maintenant que l'icône de compte permanente montre déjà qui est connecté | ✅ fait — remplacé par "Bonjour, X" (pratique courante — N26, Revolut, Notion...), plus chaleureux et qui n'a plus vocation à répéter une information de statut déjà visible ailleurs. Reste le même raccourci cliquable vers "Mon compte" |
| Le sélecteur de devise (création de groupe) était une longue liste à plat de 37 devises, sans organisation, avec la flèche native du navigateur qui jure avec le reste du design | ✅ fait — regroupé en deux `<optgroup>` ("Devises africaines" / "Devises internationales", cf. `region` sur chaque entrée dans `scripts/data.js`) pour retrouver plus vite une devise africaine (public cible principal de l'app) sans défiler tout le reste ; flèche native masquée (`appearance: none`) et remplacée par un chevron cohérent avec le reste de l'app |
| L'effet de flash en tapant le prénom d'un nouveau membre (invité à la création d'un groupe, ou "+ ajouter un membre") revenait par moments malgré un premier correctif (debounce de 300ms) | ✅ corrigé définitivement — le debounce réduisait la fréquence du problème sans l'éliminer : passé ce délai, un `setState` complet reconstruit tout le DOM de la modale (donc aussi le champ "Prénom" en cours de frappe), perturbant le clavier virtuel mobile dès qu'on marque une pause. Remplacé par un correctif chirurgical : seul le petit bloc sous le champ (suggestions de profils existants / bandeau "déjà lié·e") est régénéré, le champ "Prénom" lui-même ne quitte plus jamais le DOM pendant la frappe. Vérifié (Playwright) : le focus et la position du curseur restent intacts après le rafraîchissement des suggestions |
| Après création d'un groupe, l'app revenait sur la liste des groupes plutôt que d'ouvrir directement le nouveau groupe — un aller-retour de plus avant de pouvoir y ajouter une première dépense | ✅ fait, conforme aux conventions habituelles (Splitwise, Tricount atterrissent directement dans ce qu'on vient de créer) — redirige vers l'écran "Dépenses" filtré sur ce nouveau groupe, dont l'état vide propose déjà un bouton "Ajouter une dépense" pré-scopé dessus |
| Les pastilles d'avatar des membres (initiales) utilisaient une palette de couleurs génériques posée avant l'envoi de la charte graphique de la marque, jamais mise à jour depuis — d'où un mélange visible avec le rose/vert de marque désormais utilisés partout ailleurs (boutons, logo) | ✅ fait — remplacées par 4 couleurs dérivées des 4 teintes du logo tissé (rose, vert, doré, violet), chacune éclaircie juste ce qu'il faut pour rester lisible avec le texte foncé fixe des avatars (les teintes de marque telles quelles n'offrent pas toutes un contraste suffisant une fois testées). Corrigé partout où une couleur de membre est attribuée : nouveaux membres invités par e-mail, ajoutés sans compte, et le propre compte de l'utilisateur à l'inscription. Les couleurs de statut (soldes positifs/négatifs, avertissements) ne sont volontairement pas concernées — c'est un système sémantique séparé (rouge/vert universels pour dette/crédit), pas une question d'identité de marque |
| Devise limitée à 37 devises (Afrique + une poignée de devises internationales), alors que l'app vise une ambition internationale | ✅ fait — liste étendue à 142 devises (quasi l'ensemble des devises ISO 4217 en circulation), réorganisée en 6 régions (Afrique, Europe, Amérique, Asie, Moyen-Orient, Océanie) plutôt que les 2 catégories précédentes. L'Ariary malgache (`MGA`) est placé en tête de liste, devant les autres devises africaines |
| Sur mobile, un défilement horizontal accidentel (ou l'effet de rebond élastique de certains navigateurs quand on swipe au-delà du bord gauche/droit) pouvait décaler momentanément l'app hors de son centrage | ✅ fait — `overflow-x: hidden` et `overscroll-behavior-x: none` sur `html`/`body`, qui empêchent tout défilement horizontal de la page (le défilement vertical normal, lui, n'est pas concerné) |
| Après le correctif de la palette d'avatar ci-dessus : aucun changement visible pour les membres déjà créés (soi-même y compris) | ✅ fait — le correctif front-end ne s'applique qu'aux nouveaux membres ; les profils déjà en base gardaient leur ancienne couleur, sans mécanisme pour les mettre à jour rétroactivement. Nouvelle migration `0012_rebrand_profile_colors.sql` (cf. `supabase/README.md`) : réattribue la nouvelle palette à tous les profils déjà créés (en cycle par ordre de création), et corrige aussi la valeur par défaut de la colonne et le repli du trigger de création de profil (utilisé par la connexion par lien magique, qui ne fournit pas de couleur) — jusque-là encore sur l'ancienne couleur générique. Testée de bout en bout sur un schéma Postgres local reproduisant celui de production |
| Pas de lien vers "À propos" sur la page de connexion, seulement accessible une fois connecté (utile pourtant à quelqu'un qui arrive là sans repère, ex. via un lien d'invitation) | ✅ fait — lien discret "À propos" ancré en bas de la page de connexion (tous ses sous-écrans : mot de passe, lien magique, inscription, mot de passe oublié), volontairement en petit et en retrait pour ne pas concurrencer l'action principale (se connecter/s'inscrire). Réutilise le même écran "À propos" que celui accessible depuis "Mon compte", avec un état dédié puisque la navigation habituelle (pile d'écrans) n'existe pas avant connexion |
| Règle de mot de passe pas clairement spécifiée : minimum incohérent selon l'écran (4 caractères à la connexion — un reste sans logique, la connexion ne "choisit" pas de mot de passe — 6 à l'inscription et au changement de mot de passe) | ✅ fait — minimum relevé à 8 caractères à la création (inscription) et au changement de mot de passe, affiché directement dans le champ (`•••••••• (8 caractères min)`) plutôt que découvert seulement après un envoi refusé. Pas d'exigence de complexité (majuscule/chiffre/symbole imposés) — les recommandations actuelles (NIST 800-63B) donnent la priorité à la longueur, ces règles de composition ayant tendance à pousser vers des mots de passe plus prévisibles, pas plus sûrs. Le contrôle à la connexion (juste vérifier un champ non vide) n'a plus de minimum arbitraire, Supabase renvoyant de toute façon "e-mail ou mot de passe incorrect" si la valeur ne correspond pas au compte. Point restant côté dashboard Supabase (Authentication → Providers → Email) : sa propre exigence minimale de mot de passe, réglée par défaut à 6, n'est pas modifiable depuis le code — à aligner sur 8 manuellement si un contrôle strictement serveur est souhaité en plus de celui du formulaire |
| Sur desktop, "Mon compte" (À propos + Se déconnecter) réutilisait telle quelle la feuille glissée depuis le bas pensée pour mobile — peu idiomatique sur un écran large, et "Se déconnecter" stylé comme un lien rouge d'action destructrice alors que se déconnecter n'a rien de dangereux | ✅ fait — remplacé sur desktop (≥900px) par un menu déroulant ancré à l'avatar en bas du menu latéral, façon Slack/Notion/Discord (en-tête avec avatar/nom, puis "À propos" et "Se déconnecter" en lignes de menu neutres, sans couleur d'alerte). Se ferme au clic en dehors. La feuille glissée d'origine reste utilisée telle quelle sur mobile (<900px), où elle correspond bien à la convention des apps natives |
| Après ce changement : sur desktop, cliquer sur l'avatar ouvrait bien le nouveau menu déroulant, mais aussi l'ancienne feuille "Mon compte" en même temps (les deux superposés) ; l'avatar lui-même restait un aplat de couleur plat, sans relief | ✅ fait — la règle qui masque la feuille mobile sur desktop (`.account-modal-mobile`) et celle, plus générale, qui affiche toute feuille glissée (`.modal-overlay`) avaient la même spécificité CSS ; comme cette dernière est déclarée plus loin dans la feuille de style, c'est elle qui l'emportait et réaffichait la feuille malgré tout. Corrigée en ciblant `.modal-overlay.account-modal-mobile` (spécificité supérieure, gagne quel que soit l'ordre des règles). Avatar du menu latéral et de l'en-tête du menu déroulant : ajout d'un léger contour et d'une ombre portée pour un peu de relief sur ces fonds plats |
| Encadré rectangulaire visible derrière l'avatar du menu latéral (fond gris, bordure) | ✅ fait — `.sidebar-account` est un `<button>` : les styles par défaut du navigateur pour cet élément (fond gris, bordure) n'avaient jamais été neutralisés (`border: none; background: none`), contrairement aux autres boutons personnalisés de l'app. L'encadré n'était donc pas voulu, c'est un oubli de réinitialisation |
| Le mode jour/nuit vivait dans une icône permanente de la barre du haut, sur toutes les tailles d'écran — trop de place prise dans une barre déjà chargée (avatar de compte + icône thème + bouton "+") pour un réglage qu'on ne change quasiment jamais | ✅ fait — retiré de la barre du haut, déplacé dans "Mon compte" (feuille mobile) et le menu déroulant (desktop), aux côtés de "À propos"/"Se déconnecter" (même logique de regroupement des réglages de compte, façon Slack/Notion). La ligne affiche l'action à venir ("Mode sombre"/"Mode clair" selon le thème actuel, cf. icône lune/soleil) plutôt que l'état courant |

**Audit pré-lancement — cross-device / cross-navigateur / cross-OS**

Revue ciblée sur les pièges classiques qui ne se voient qu'à l'usage réel (un
navigateur/appareil précis), pas en relisant le code sur desktop :

| Constat | Statut |
|---|---|
| Tous les champs de saisie (`.text-input`, sélecteurs de part/répartition) étaient sous les 16px de police — en dessous de ce seuil, Safari iOS zoome automatiquement toute la page dès qu'on touche un champ, un comportement natif non désactivable autrement que par la taille de police | ✅ fait — tous remontés à 16px minimum (`.text-input`, `.participant-select`, `.child-percent-input`, ce dernier élargi en conséquence pour rester lisible) |
| Le retour visuel au tap (`.pressable:active`, utilisé sur la quasi-totalité des boutons de l'app) ne se déclenche probablement jamais sur Safari iOS : cette pseudo-classe n'y est activée par le moteur WebKit que si un gestionnaire d'événement tactile existe quelque part dans la page, ce qui n'était le cas nulle part ici | ✅ fait — un écouteur `touchstart` global (sans effet propre, juste là pour activer le comportement) posé au démarrage de l'app |
| Champs e-mail/mot de passe sans `type="email"` ni attributs `autocomplete` : clavier mobile non optimisé (pas de raccourci "@"), et surtout gestionnaires de mots de passe (Trousseau iCloud, Chrome...) qui autocomplètent mal ou ne proposent pas de mot de passe robuste à l'inscription | ✅ fait — `type="email"` sur tous les champs e-mail (les siens et ceux d'un tiers invité) ; `autocomplete="email"/"current-password"/"new-password"/"name"` sur les champs propres à l'identité de l'utilisateur (connexion, inscription, changement de mot de passe) |
| `backdrop-filter` (flou du menu du bas, des fenêtres modales) posé sans le préfixe `-webkit-` : Safari (macOS et iOS, donc aussi Chrome iOS qui partage le même moteur) n'a supporté la version non préfixée qu'à partir de la version 18 — sans le préfixe, le flou disparaît silencieusement sur les versions antérieures, majoritaires au moment du lancement | ✅ fait — `-webkit-backdrop-filter` ajouté partout à côté de la version standard |
| Pas de `color-scheme` déclaré : en thème sombre, les éléments natifs du navigateur (sélecteur de date, liste déroulante ouverte) pouvaient s'afficher avec un rendu clair par défaut, en décalage avec le reste de l'app | ✅ fait — `color-scheme: dark`/`light` posé sur chacun des deux thèmes |
| Export CSV/Excel (téléchargement via un lien `download` généré en JS) : mécanisme historiquement peu fiable sur Safari iOS, qui l'ignore parfois selon le type de fichier et navigue à la place, remplaçant l'app en cours au lieu de proposer un enregistrement | ✅ fait — filet de sécurité `target="_blank"` : si Safari ignore l'attribut `download`, le fichier s'ouvre dans un nouvel onglet (état de l'app préservé) plutôt que de remplacer la page, avec toujours la possibilité d'enregistrer via "Partager" |
| Tous les styles `:hover` de l'app (boutons, menu latéral desktop...) s'appliquaient sans condition — sur un appareil tactile (téléphone, ou tablette assez large pour passer les seuils desktop, ex. iPad en paysage), un survol reste "collé" après un tap jusqu'au tap suivant ailleurs, faute d'un vrai pointeur pour en sortir | ✅ fait — chaque règle `:hover` limitée par `@media (hover: hover)`, qui ne matche que les appareils à pointeur réel (souris/trackpad) |
| `@supabase/supabase-js` chargé en CDN sans version exacte (`@2`, juste la version majeure) — une mise à jour mineure/patch future pourrait changer un comportement sans qu'on l'ait décidé, au prochain rechargement | ✅ fait — figé sur la version exacte utilisée et vérifiée (`@2.110.2`) |
| Aucun `aria-label` sur les boutons à icône seule (fermer une modale, retour, ajouter, retirer un membre/reçu, enregistrer un paiement...) — un lecteur d'écran n'a alors qu'un "bouton" sans nom à annoncer | ✅ fait — `aria-label` ajouté sur tous les boutons dont l'icône est le seul contenu |
| Pas de prise en compte de `prefers-reduced-motion` (réglage d'accessibilité du système : iOS, Android, macOS, Windows) — l'animation de l'écran de lancement, les fondus/glissements de modales et l'effet d'appui des boutons jouaient toujours, même quand l'utilisateur a explicitement demandé de réduire les animations | ✅ fait — règle globale qui réduit toute animation/transition CSS à une durée quasi nulle quand ce réglage est actif ; les confettis (JS, pas CSS) le respectaient déjà via l'option `disableForReducedMotion` de la librairie |

**Couleur principale : vert (`#0F8F6B`) plutôt que rose (`#D6247A`)**

Demande explicite : utiliser le vert comme couleur principale de la marque à
la place du rose. Les deux teintes coexistaient déjà dans la palette
(`--brand-primary`/`--brand-secondary`) — inversion des deux rôles plutôt
qu'une nouvelle teinte inventée, avec le même écart clair/sombre par thème
que celui déjà en place pour le rose (dérivé par calcul HSL, même logique
que les survols existants). Répercuté partout où "la" couleur de marque
(pas le logo tissé multicolore, cf. plus bas) apparaît en une seule teinte :
boutons principaux, liens, icône de groupe, spinner de scan de ticket,
logo simplifié (page de connexion, menu latéral, barre du haut), favicon,
icônes de raccourci (192/512/apple-touch), couleur de thème du navigateur
(`theme-color`, `manifest.json`), et les habillages de marque des exports
Excel/PDF (en-têtes, mot "Rohy"). Le logo tissé à 4 couleurs (rose, vert,
doré, violet — écran de lancement, page "À propos", en-tête d'accueil) et
la palette d'avatars des membres restent volontairement inchangés : ce
sont des systèmes de couleur distincts de "la" couleur principale unique,
qui n'ont pas vocation à suivre ce changement (le rose reste l'un des 4
fils du tissage, et l'une des 4 teintes d'avatar). Les icônes bitmap
(favicon PNG 192/512/apple-touch, image de partage) ont été régénérées à
l'identique pixel près (recoloration ciblée, pas un nouveau rendu depuis
zéro) pour ne pas perdre en netteté par rapport aux fichiers d'origine.

L'inversion primaire/secondaire ci-dessus a eu un effet de bord repéré
juste après coup : le libellé de l'onglet actif du menu (bas sur mobile,
latéral sur desktop) et le lien "Tout sélectionner" (formulaire de
dépense) suivent `--brand-secondary`, qui valait le vert avant ce
changement — après l'inversion, il pointait vers le rose, faisant passer
ces deux textes du vert au rose sans que ce soit voulu. Corrigé en
alignant `--brand-secondary` sur la même valeur que `--brand-primary`
(vert) dans les deux thèmes : plus vraiment besoin d'une seconde teinte de
marque distincte pour l'instant, les deux usages qui s'appuyaient dessus
visaient déjà "la" couleur de marque, pas un accent différent. Les
confettis (célébration d'un remboursement), qui lisaient aussi
`--brand-secondary` pour varier leurs couleurs, reprennent directement le
rose et le doré du logo tissé à la place — but purement décoratif, pas
besoin d'un jeton de couleur sémantique pour ça.

Pour rappel (cf. plus haut) : la pastille d'avatar reste volontairement
sur son propre système de couleurs (rose/vert/doré/violet, cycle par
ordre de création) — un avatar rose après ce changement n'est donc pas un
oubli, juste le premier membre créé retombant sur la première teinte du
cycle.

**Audit UX/UI — listes qui grandissent**

Point de départ : l'affichage en boutons/cartes de l'écran "Groupes" fonctionne
bien pour un petit nombre de groupes, mais prend beaucoup de place à mesure
qu'il grandit. Même famille de problème ailleurs :

| Zone | Problème | Statut |
|---|---|---|
| "Gérer les membres" | Une carte assez dense par membre — le plus pénalisant des listes verticales pour un grand groupe | ✅ fait — recherche par prénom (au-delà de 5 membres), ne filtre que les cartes affichées, pas les menus déroulants (responsable/foyer) qui continuent de lister tout le monde |
| Pastilles de filtre par groupe (accueil, dépenses, fiche personne) et "payé par" (formulaire dépense) | `pill-row` en retour à la ligne — au-delà d'une poignée de groupes/membres, pousse le contenu vers le bas au lieu de rester compact | ⏳ différé |
| Écran "Groupes" | Liste verticale de cartes riches, une par groupe, sans recherche ni tri | ⏳ différé |
| "Qui participe ?" (formulaire dépense) et tableau payé/part/solde (fiche groupe) | Listes verticales sans recherche | ⏳ différé — moins critique, déjà contenues dans un scroll |
| Historique | Flux unique (dépenses + paiements + rappels) sans pagination depuis le début du compte | ⏳ différé |

Le moteur de calcul (`scripts/calc.js`) reste porté fidèlement et testé côté
client ; la logique de dettes elle-même n'est pas dupliquée côté serveur —
les policies RLS protègent l'accès aux données, mais les calculs de solde
restent effectués dans le navigateur à partir des données Postgres chargées.

Hors périmètre explicite (cf. spec de hand-off) : conversion de devises en
temps réel, rôles avancés au-delà de admin/membre, paiement intégré (l'app
reste déclarative — "marquer comme payé"). L'export de données, initialement
dans cette liste, a finalement été demandé et livré (cf. tableau ci-dessus).

## Bugs découverts en conditions réelles (post-audit pré-lancement)

| Constat | Statut |
|---|---|
| Créer un compte (lien magique, mot de passe, ou ré-invitation) avec une adresse déjà utilisée par un profil "invité sans compte" existant échouait avec une erreur Postgres brute (`duplicate key value violates unique constraint "profiles_email_unique"`), bloquant complètement l'inscription | ✅ fait — migration `0013_link_guest_profile_on_signup.sql` (cf. `supabase/README.md`) : le trigger de création de profil rattache désormais ce profil existant au nouveau compte au lieu d'en créer un doublon, en conservant son nom/couleur/part/historique |

## RGPD

Ce qui est déjà en place côté app (chacun avec sa propre entrée dans ce
README au moment de son ajout) :
- **Politique de confidentialité** — accessible avant connexion (pied de
  page de la landing) et après (menu compte) ; `renderPrivacyScreen` dans
  `scripts/app.js`.
- **Consentement à la mesure d'audience** — bandeau qui bloque le
  chargement de Cloudflare Web Analytics tant qu'il n'est pas explicitement
  accepté (`loadCloudflareAnalytics`, `acceptAnalytics`/`declineAnalytics`).
- **Suppression de compte** (droit à l'effacement) — "Supprimer mon
  compte" dans le menu, cf. `supabase/functions/delete-account`.
- **Export des données personnelles** (portabilité) — "Télécharger mes
  données" dans la politique de confidentialité (`exportMyData`).

Registre des sous-traitants (à tenir à jour si un prestataire change) —
utile pour un registre des traitements (article 30 RGPD) ou pour répondre
à un partenaire qui demande le détail des sous-traitants :

| Sous-traitant | Traitement | Données concernées | Localisation |
|---|---|---|---|
| Supabase, Inc. | Base de données, authentification, stockage des reçus | Toutes les données de l'app | États-Unis |
| Cloudflare, Inc. | Mesure d'audience (sans cookie de suivi individuel) | Adresse IP, pages visitées | États-Unis |
| Resend | Envoi des e-mails de rappel de paiement | Adresse e-mail du destinataire, contenu du rappel | États-Unis |
| Anthropic PBC | Lecture automatique des tickets scannés | Photo du ticket envoyée à l'API | États-Unis |

**Reste à faire, côté administratif plutôt que code** : vérifier que
chacun de ces prestataires propose un DPA (data processing agreement) /
des clauses contractuelles types couvrant le transfert hors UE, et
l'accepter côté compte Supabase/Cloudflare/Resend/Anthropic — ce n'est
pas quelque chose que du code peut faire à ta place.

## Domaine

Le domaine définitif de l'app est **rohy-app.com** (remplace l'URL GitHub
Pages `zina-rvls.github.io/test`). Fichier `CNAME` à la racine du dépôt
(nécessaire pour que GitHub Pages serve le site sur ce domaine plutôt que
sur son URL par défaut). Reste à faire côté hébergeur du domaine (LWS) et
côté Supabase — cf. `supabase/README.md`, section 3, pour le détail des
étapes DNS et de la mise à jour de l'URL Configuration.
