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

  var KotikotaData = {
    CURRENCIES: CURRENCIES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = KotikotaData;
  } else {
    root.KotikotaData = KotikotaData;
  }
}(typeof self !== 'undefined' ? self : this));
