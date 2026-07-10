# kotikota — suivi des dépenses entre amis

Application de suivi de dépenses partagées entre amis/famille : qui a payé
quoi, la part de contribution de chacun (réglable par personne, ex. 0,5 =
demi-part), foyers et personnes à charge (prise en charge permanente, dette
automatiquement fusionnée avec le responsable), et qui doit quoi à qui après
paiements déjà effectués. Groupes/événements multiples (avec devise et
invitation par e-mail à la création), historique, relance de paiement.

Ce dépôt implémente le hand-off de design **kotikota** (prototype HTML fourni
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
- `styles/style.css` — design tokens kotikota (couleurs, typographie, rayons,
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
| Export des données (CSV/Excel/PDF), initialement noté hors périmètre dans la spec de hand-off | ✅ fait, sur demande explicite — un groupe expose désormais un export CSV/Excel/PDF (fiche groupe, sous "Exporter"), contenant les dépenses détaillées et les soldes/transactions à effectuer ; généré entièrement côté client (SheetJS pour le .xlsx, jsPDF + autotable pour le .pdf), sans aucun appel serveur. Le format PPT initialement envisagé a été écarté après clarification (peu pertinent pour ce cas d'usage) |
| Export PDF : le séparateur de milliers des montants (espace fine insécable U+202F, produite par `toLocaleString('fr-FR')`) s'affichait comme un "/" — absente de la police Helvetica intégrée à jsPDF | ✅ corrigé — remplacée par une espace normale, uniquement dans le rendu PDF (`fmtIn` reste inchangé partout ailleurs, où le rendu navigateur l'affiche correctement) |

**Reste à faire / différé**

| Piste | Statut |
|---|---|
| Montant ou pourcentage exact par personne sur une dépense, au-delà du poids relatif | ✅ fait — cf. ligne "modes de répartition" ci-dessus (recoupait la Fonctionnalité 8 du brief) |
| Optimisation avancée des remboursements (au-delà de la simplification gloutonne actuelle) | ⏳ différé — Fonctionnalité 9 du brief, Étape 2 |
| Dépenses récurrentes | ⏳ différé — hors brief actuel, à arbitrer |
| Notification push pour les rappels (en plus de l'e-mail) | ⏳ différé — chantier à part (service worker, clés VAPID, autorisation navigateur) |
| Animation d'accueil juste après connexion (login/inscription) | ⏳ différé — chantier à part, pas encore scopé |

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
