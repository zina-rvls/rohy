/**
 * Liste des devises proposées à la création d'un groupe. Les personnes
 * viennent désormais de Supabase (table `profiles`) — plus de données de
 * départ statiques pour les comptes.
 */
(function (root) {
  'use strict';

  var CURRENCIES = [
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'USD', label: 'Dollar américain', symbol: '$' },
    { code: 'GBP', label: 'Livre sterling', symbol: '£' },
    { code: 'CHF', label: 'Franc suisse', symbol: 'CHF' },
    { code: 'CAD', label: 'Dollar canadien', symbol: '$' },
    { code: 'MGA', label: 'Ariary malgache', symbol: 'Ar' },
    { code: 'XOF', label: 'Franc CFA (UEMOA)', symbol: 'FCFA' },
  ];

  var EXPENSE_CATEGORIES = [
    { id: 'courses', label: 'courses', icon: 'ph-bold ph-shopping-cart' },
    { id: 'repas', label: 'repas', icon: 'ph-bold ph-fork-knife' },
    { id: 'logement', label: 'logement', icon: 'ph-bold ph-house' },
    { id: 'transport', label: 'transport', icon: 'ph-bold ph-car' },
    { id: 'loisirs', label: 'loisirs', icon: 'ph-bold ph-confetti' },
    { id: 'sante', label: 'santé', icon: 'ph-bold ph-heartbeat' },
    { id: 'autre', label: 'autre', icon: 'ph-bold ph-receipt' },
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
