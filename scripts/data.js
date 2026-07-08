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
  // africains — cf. fmtIn dans app.js).
  var CURRENCIES = [
    // Devises africaines (public cible principal de l'app).
    { code: 'XOF', label: 'Franc CFA (UEMOA)', symbol: 'FCFA', decimals: 0 },
    { code: 'XAF', label: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0 },
    { code: 'MGA', label: 'Ariary malgache', symbol: 'Ar', decimals: 0 },
    { code: 'GNF', label: 'Franc guinéen', symbol: 'FG', decimals: 0 },
    { code: 'RWF', label: 'Franc rwandais', symbol: 'FRw', decimals: 0 },
    { code: 'BIF', label: 'Franc burundais', symbol: 'FBu', decimals: 0 },
    { code: 'KMF', label: 'Franc comorien', symbol: 'CF', decimals: 0 },
    { code: 'DJF', label: 'Franc djiboutien', symbol: 'Fdj', decimals: 0 },
    { code: 'CDF', label: 'Franc congolais', symbol: 'FC', decimals: 2 },
    { code: 'UGX', label: 'Shilling ougandais', symbol: 'USh', decimals: 0 },
    { code: 'KES', label: 'Shilling kényan', symbol: 'KSh', decimals: 2 },
    { code: 'TZS', label: 'Shilling tanzanien', symbol: 'TSh', decimals: 2 },
    { code: 'ETB', label: 'Birr éthiopien', symbol: 'Br', decimals: 2 },
    { code: 'NGN', label: 'Naira nigérian', symbol: '₦', decimals: 2 },
    { code: 'GHS', label: 'Cedi ghanéen', symbol: 'GH₵', decimals: 2 },
    { code: 'GMD', label: 'Dalasi gambien', symbol: 'D', decimals: 2 },
    { code: 'LRD', label: 'Dollar libérien', symbol: 'L$', decimals: 2 },
    { code: 'SLE', label: 'Leone sierra-léonais', symbol: 'Le', decimals: 2 },
    { code: 'MAD', label: 'Dirham marocain', symbol: 'DH', decimals: 2 },
    { code: 'DZD', label: 'Dinar algérien', symbol: 'DA', decimals: 2 },
    { code: 'TND', label: 'Dinar tunisien', symbol: 'DT', decimals: 3 },
    { code: 'LYD', label: 'Dinar libyen', symbol: 'LD', decimals: 3 },
    { code: 'EGP', label: 'Livre égyptienne', symbol: 'E£', decimals: 2 },
    { code: 'ZAR', label: 'Rand sud-africain', symbol: 'R', decimals: 2 },
    { code: 'NAD', label: 'Dollar namibien', symbol: 'N$', decimals: 2 },
    { code: 'BWP', label: 'Pula botswanais', symbol: 'P', decimals: 2 },
    { code: 'ZMW', label: 'Kwacha zambien', symbol: 'ZK', decimals: 2 },
    { code: 'MWK', label: 'Kwacha malawite', symbol: 'MK', decimals: 2 },
    { code: 'MZN', label: 'Metical mozambicain', symbol: 'MT', decimals: 2 },
    { code: 'AOA', label: 'Kwanza angolais', symbol: 'Kz', decimals: 2 },
    { code: 'MUR', label: 'Roupie mauricienne', symbol: 'Rs', decimals: 2 },
    { code: 'SCR', label: 'Roupie seychelloise', symbol: 'SR', decimals: 2 },
    // Devises internationales.
    { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2 },
    { code: 'USD', label: 'Dollar américain', symbol: '$', decimals: 2 },
    { code: 'GBP', label: 'Livre sterling', symbol: '£', decimals: 2 },
    { code: 'CHF', label: 'Franc suisse', symbol: 'CHF', decimals: 2 },
    { code: 'CAD', label: 'Dollar canadien', symbol: '$', decimals: 2 },
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

  var KotikotaData = {
    CURRENCIES: CURRENCIES,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = KotikotaData;
  } else {
    root.KotikotaData = KotikotaData;
  }
}(typeof self !== 'undefined' ? self : this));
