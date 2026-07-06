/**
 * Données de référence de l'app : la personne par défaut au premier
 * lancement (seul l'utilisateur courant est connu ; les autres membres
 * rejoignent via invitation par e-mail à la création d'un groupe) et la
 * liste des devises proposées à la création d'un groupe.
 */
(function (root) {
  'use strict';

  var DEFAULT_PEOPLE = [
    { id: 'moi', name: 'Toi', color: '#7C5CFF', sharePercent: 100 },
  ];

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
    DEFAULT_PEOPLE: DEFAULT_PEOPLE,
    CURRENCIES: CURRENCIES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = KotikotaData;
  } else {
    root.KotikotaData = KotikotaData;
  }
}(typeof self !== 'undefined' ? self : this));
