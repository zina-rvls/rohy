/**
 * Données de départ (seed) — mêmes personnes/groupes/dépenses que le
 * prototype de design, pour une continuité de démo. En production ces
 * données viendraient d'une vraie base + API (cf. README, section P0).
 */
(function (root) {
  'use strict';

  var PEOPLE = [
    { id: 'moi', name: 'Toi', color: '#7C5CFF' },
    { id: 'marc', name: 'Marc', color: '#4ADE80' },
    { id: 'julie', name: 'Julie', color: '#F97362' },
    { id: 'tom', name: 'Tom', color: '#F4D35E', isChild: true, childPercent: 50, defaultCoveredBy: 'marc' },
    { id: 'karim', name: 'Karim', color: '#9B81FF' },
    { id: 'anna', name: 'Anna', color: '#29B876' },
  ];

  var GROUPS = [
    { id: 'g1', name: 'Vacances Corse', icon: 'ph-bold ph-umbrella-simple', memberIds: ['moi', 'marc', 'julie', 'tom', 'karim'], adminId: 'moi' },
    { id: 'g2', name: 'Colocation', icon: 'ph-bold ph-house-line', memberIds: ['moi', 'anna', 'karim'], adminId: 'moi' },
    { id: 'g3', name: 'Anniversaire Sarah', icon: 'ph-bold ph-confetti', memberIds: ['moi', 'marc', 'julie', 'anna'], adminId: 'marc' },
  ];

  var INITIAL_EXPENSES = [
    { id: 'e1', groupId: 'g1', label: 'Courses', icon: 'ph-bold ph-shopping-cart-simple', amount: 86, paidBy: 'marc', date: '2026-07-01', participants: ['moi', 'marc', 'julie', 'tom'], overrides: {} },
    { id: 'e2', groupId: 'g1', label: 'Essence', icon: 'ph-bold ph-gas-pump', amount: 54, paidBy: 'julie', date: '2026-07-02', participants: ['marc', 'julie', 'karim'], overrides: {} },
    { id: 'e3', groupId: 'g1', label: 'Glaces', icon: 'ph-bold ph-ice-cream', amount: 12, paidBy: 'julie', date: '2026-07-02', participants: ['karim'], overrides: { karim: 'julie' } },
    { id: 'e4', groupId: 'g1', label: 'Restaurant', icon: 'ph-bold ph-fork-knife', amount: 140, paidBy: 'moi', date: '2026-07-03', participants: ['moi', 'marc', 'julie', 'tom', 'karim'], overrides: {} },
    { id: 'e9', groupId: 'g1', label: 'Hébergement', icon: 'ph-bold ph-house-line', amount: 1000, paidExternal: 500, paidBy: 'marc', date: '2026-06-30', participants: ['moi', 'marc', 'julie', 'tom', 'karim'], overrides: {} },
    { id: 'e5', groupId: 'g2', label: 'Loyer partagé', icon: 'ph-bold ph-house-line', amount: 900, paidBy: 'anna', date: '2026-06-28', participants: ['moi', 'anna', 'karim'], overrides: {} },
    { id: 'e6', groupId: 'g2', label: 'Internet', icon: 'ph-bold ph-wifi-high', amount: 40, paidBy: 'moi', date: '2026-06-30', participants: ['moi', 'anna', 'karim'], overrides: {} },
    { id: 'e7', groupId: 'g3', label: 'Gâteau', icon: 'ph-bold ph-cake', amount: 45, paidBy: 'marc', date: '2026-06-20', participants: ['marc', 'julie', 'anna'], overrides: {} },
    { id: 'e8', groupId: 'g3', label: 'Décorations', icon: 'ph-bold ph-confetti', amount: 30, paidBy: 'moi', date: '2026-06-21', participants: ['moi', 'marc', 'julie', 'anna'], overrides: {} },
  ];

  var INITIAL_PAYMENTS = [
    { id: 'p1', from: 'karim', to: 'julie', amount: 20, date: '2026-07-03', groupId: 'g1' },
    { id: 'p2', from: 'moi', to: 'anna', amount: 100, date: '2026-06-30', groupId: 'g2' },
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
    PEOPLE: PEOPLE,
    GROUPS: GROUPS,
    INITIAL_EXPENSES: INITIAL_EXPENSES,
    INITIAL_PAYMENTS: INITIAL_PAYMENTS,
    CURRENCIES: CURRENCIES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = KotikotaData;
  } else {
    root.KotikotaData = KotikotaData;
  }
}(typeof self !== 'undefined' ? self : this));
