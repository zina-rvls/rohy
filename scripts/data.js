/**
 * Liste des devises proposées à la création d'un groupe. Les personnes
 * viennent désormais de Supabase (table `profiles`) — plus de données de
 * départ statiques pour les comptes.
 */
(function (root) {
  'use strict';

  // `decimals` : nombre de décimales généralement affichées pour cette
  // devise (0 pour les devises dont la plus petite subdivision n'est en
  // pratique jamais utilisée au quotidien, ex. la plupart des francs
  // africains — cf. fmtIn dans app.js). `region` : regroupement utilisé
  // pour organiser le sélecteur de devise en catégories (cf. optgroup dans
  // renderAddGroupModal, scripts/app.js) plutôt qu'une seule longue liste
  // à plat.
  var REGION_AFRICA = 'Devises africaines';
  var REGION_INTERNATIONAL = 'Devises internationales';
  var CURRENCIES = [
    // Devises africaines (public cible principal de l'app).
    { code: 'XOF', label: 'Franc CFA (UEMOA)', symbol: 'FCFA', decimals: 0, region: REGION_AFRICA },
    { code: 'XAF', label: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0, region: REGION_AFRICA },
    { code: 'MGA', label: 'Ariary malgache', symbol: 'Ar', decimals: 0, region: REGION_AFRICA },
    { code: 'GNF', label: 'Franc guinéen', symbol: 'FG', decimals: 0, region: REGION_AFRICA },
    { code: 'RWF', label: 'Franc rwandais', symbol: 'FRw', decimals: 0, region: REGION_AFRICA },
    { code: 'BIF', label: 'Franc burundais', symbol: 'FBu', decimals: 0, region: REGION_AFRICA },
    { code: 'KMF', label: 'Franc comorien', symbol: 'CF', decimals: 0, region: REGION_AFRICA },
    { code: 'DJF', label: 'Franc djiboutien', symbol: 'Fdj', decimals: 0, region: REGION_AFRICA },
    { code: 'CDF', label: 'Franc congolais', symbol: 'FC', decimals: 2, region: REGION_AFRICA },
    { code: 'UGX', label: 'Shilling ougandais', symbol: 'USh', decimals: 0, region: REGION_AFRICA },
    { code: 'KES', label: 'Shilling kényan', symbol: 'KSh', decimals: 2, region: REGION_AFRICA },
    { code: 'TZS', label: 'Shilling tanzanien', symbol: 'TSh', decimals: 2, region: REGION_AFRICA },
    { code: 'ETB', label: 'Birr éthiopien', symbol: 'Br', decimals: 2, region: REGION_AFRICA },
    { code: 'NGN', label: 'Naira nigérian', symbol: '₦', decimals: 2, region: REGION_AFRICA },
    { code: 'GHS', label: 'Cedi ghanéen', symbol: 'GH₵', decimals: 2, region: REGION_AFRICA },
    { code: 'GMD', label: 'Dalasi gambien', symbol: 'D', decimals: 2, region: REGION_AFRICA },
    { code: 'LRD', label: 'Dollar libérien', symbol: 'L$', decimals: 2, region: REGION_AFRICA },
    { code: 'SLE', label: 'Leone sierra-léonais', symbol: 'Le', decimals: 2, region: REGION_AFRICA },
    { code: 'MAD', label: 'Dirham marocain', symbol: 'DH', decimals: 2, region: REGION_AFRICA },
    { code: 'DZD', label: 'Dinar algérien', symbol: 'DA', decimals: 2, region: REGION_AFRICA },
    { code: 'TND', label: 'Dinar tunisien', symbol: 'DT', decimals: 3, region: REGION_AFRICA },
    { code: 'LYD', label: 'Dinar libyen', symbol: 'LD', decimals: 3, region: REGION_AFRICA },
    { code: 'EGP', label: 'Livre égyptienne', symbol: 'E£', decimals: 2, region: REGION_AFRICA },
    { code: 'ZAR', label: 'Rand sud-africain', symbol: 'R', decimals: 2, region: REGION_AFRICA },
    { code: 'NAD', label: 'Dollar namibien', symbol: 'N$', decimals: 2, region: REGION_AFRICA },
    { code: 'BWP', label: 'Pula botswanais', symbol: 'P', decimals: 2, region: REGION_AFRICA },
    { code: 'ZMW', label: 'Kwacha zambien', symbol: 'ZK', decimals: 2, region: REGION_AFRICA },
    { code: 'MWK', label: 'Kwacha malawite', symbol: 'MK', decimals: 2, region: REGION_AFRICA },
    { code: 'MZN', label: 'Metical mozambicain', symbol: 'MT', decimals: 2, region: REGION_AFRICA },
    { code: 'AOA', label: 'Kwanza angolais', symbol: 'Kz', decimals: 2, region: REGION_AFRICA },
    { code: 'MUR', label: 'Roupie mauricienne', symbol: 'Rs', decimals: 2, region: REGION_AFRICA },
    { code: 'SCR', label: 'Roupie seychelloise', symbol: 'SR', decimals: 2, region: REGION_AFRICA },
    // Devises internationales.
    { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2, region: REGION_INTERNATIONAL },
    { code: 'USD', label: 'Dollar américain', symbol: '$', decimals: 2, region: REGION_INTERNATIONAL },
    { code: 'GBP', label: 'Livre sterling', symbol: '£', decimals: 2, region: REGION_INTERNATIONAL },
    { code: 'CHF', label: 'Franc suisse', symbol: 'CHF', decimals: 2, region: REGION_INTERNATIONAL },
    { code: 'CAD', label: 'Dollar canadien', symbol: '$', decimals: 2, region: REGION_INTERNATIONAL },
  ];

  var EXPENSE_CATEGORIES = [
    { id: 'courses', label: 'Courses', icon: 'ph-bold ph-shopping-cart' },
    { id: 'repas', label: 'Repas', icon: 'ph-bold ph-fork-knife' },
    { id: 'logement', label: 'Logement', icon: 'ph-bold ph-house' },
    { id: 'transport', label: 'Transport', icon: 'ph-bold ph-car' },
    { id: 'loisirs', label: 'Loisirs', icon: 'ph-bold ph-confetti' },
    { id: 'sante', label: 'Santé', icon: 'ph-bold ph-heartbeat' },
    { id: 'autre', label: 'Autre', icon: 'ph-bold ph-receipt' },
  ];

  // Modes de répartition d'une dépense (au-delà du poids permanent des
  // profils) — cf. scripts/calc.js, computeShares.
  var SPLIT_MODES = [
    { id: 'default', label: 'Part' },
    { id: 'equal', label: 'Équitable' },
    { id: 'shares', label: 'Part ponctuelle' },
    { id: 'exact', label: 'Montant exact' },
    { id: 'percent', label: 'Pourcentage' },
  ];

  var RohyData = {
    CURRENCIES: CURRENCIES,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    SPLIT_MODES: SPLIT_MODES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = RohyData;
  } else {
    root.RohyData = RohyData;
  }
}(typeof self !== 'undefined' ? self : this));
