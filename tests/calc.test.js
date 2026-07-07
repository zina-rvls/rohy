/**
 * Tests du moteur de calcul (scripts/calc.js). Exécution : node tests/calc.test.js
 * Couvre les scénarios listés dans la spec de hand-off :
 *  - dette croisée entre 2+ personnes
 *  - prise en charge permanente vs ponctuelle
 *  - parts enfants mixtes dans une même dépense
 *  - paiement partiel réparti sur plusieurs dépenses (FIFO)
 */
'use strict';

const assert = require('assert');
const calc = require('../scripts/calc.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}`);
    console.error(err.message);
  }
}

function close(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${msg}: attendu ${expected}, obtenu ${actual}`);
}

// --- Scénario 1 : dette croisée entre 2+ personnes ---
test('dette croisée entre 2+ personnes se réduit à un seul solde net par paire', () => {
  const people = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ];
  const expenses = [
    // A paie 90 pour A, B, C (30 chacun)
    { id: 'e1', groupId: 'g', label: 'e1', amount: 90, paidBy: 'a', date: '2026-01-01', participants: ['a', 'b', 'c'], overrides: {} },
    // B paie 30 pour A et B (15 chacun) -> A doit 15 à B
    { id: 'e2', groupId: 'g', label: 'e2', amount: 30, paidBy: 'b', date: '2026-01-02', participants: ['a', 'b'], overrides: {} },
  ];
  const debts = calc.computeDebts(people, expenses, []);
  // B doit 30 à A (part de e1), A doit 15 à B (part de e2) => net : B doit 15 à A
  close(calc.pairNet('a', 'b', debts), 15, 'solde net A vis-à-vis de B');
  close(calc.pairNet('a', 'c', debts), 30, 'solde net A vis-à-vis de C');
  // une seule clé doit exister par paire (a|b ou b|a, jamais les deux)
  assert.ok(!(debts['a|b'] && debts['b|a']), 'une seule direction de dette doit subsister pour la paire a/b');
});

// --- Scénario 2 : prise en charge permanente vs ponctuelle ---
test('override ponctuel (overrides) prime sur la prise en charge permanente (guardianId)', () => {
  const people = [
    { id: 'parent', name: 'Parent' },
    { id: 'tiers', name: 'Tiers' },
    { id: 'enfant', name: 'Enfant', guardianId: 'parent' },
  ];
  // Dépense sans override : l'enfant est pris en charge par son responsable permanent (parent)
  const withoutOverride = [
    { id: 'e1', groupId: 'g', label: 'e1', amount: 20, paidBy: 'tiers', date: '2026-01-01', participants: ['enfant'], overrides: {} },
  ];
  const debts1 = calc.computeDebts(people, withoutOverride, []);
  // pairNet(x, y) > 0 signifie "y doit à x" ; ici le parent doit au tiers, donc pairNet(parent, tiers) < 0
  close(calc.pairNet('parent', 'tiers', debts1), -20, 'sans override, le parent doit 20 au tiers');

  // Dépense avec override ponctuel : un autre adulte prend en charge cette dépense précise
  const withOverride = [
    { id: 'e2', groupId: 'g', label: 'e2', amount: 20, paidBy: 'tiers', date: '2026-01-01', participants: ['enfant'], overrides: { enfant: 'tiers2' } },
  ];
  const people2 = people.concat([{ id: 'tiers2', name: 'Tiers2' }]);
  const debts2 = calc.computeDebts(people2, withOverride, []);
  close(calc.pairNet('parent', 'tiers', debts2), 0, "l'override ponctuel retire la dette du responsable permanent");
  close(calc.pairNet('tiers2', 'tiers', debts2), -20, "l'override ponctuel impute la dette au responsable ponctuel");
});

// --- Scénario 3 : parts pondérées (coefficient relatif, pas un % absolu) ---
test('computeShares : la part de chacun est proportionnelle à son poids relatif (shareWeight)', () => {
  const people = [
    { id: 'a', name: 'A' },
    { id: 'part50', name: 'Part50', shareWeight: 0.5 },
  ];
  // Cas rapporté par l'utilisateur : A (poids 1) + Part50 (poids 0.5) sur 25000
  // -> total des poids = 1.5, valeur d'une part = 16666.67 -> A doit 16666.67, Part50 doit 8333.33.
  const shares2 = calc.computeShares(25000, ['a', 'part50'], people);
  close(shares2.a, 16666.67, 'A (poids 1) doit les 2/3 de 25000');
  close(shares2.part50, 8333.33, 'Part50 (poids 0.5) doit le 1/3 de 25000');

  const people4 = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'part50', name: 'Part50', shareWeight: 0.5 },
    { id: 'part25', name: 'Part25', shareWeight: 0.25 },
  ];
  // Total des poids = 1 + 1 + 0.5 + 0.25 = 2.75, valeur d'une part = 200 / 2.75.
  const shares4 = calc.computeShares(200, ['a', 'b', 'part50', 'part25'], people4);
  const unit = 200 / 2.75;
  close(shares4.a, unit, 'A (poids 1)');
  close(shares4.b, unit, 'B (poids 1)');
  close(shares4.part50, unit * 0.5, 'Part50 (poids 0.5)');
  close(shares4.part25, unit * 0.25, 'Part25 (poids 0.25)');
});

// --- Scénario 4 : paiement partiel réparti sur plusieurs dépenses (FIFO) ---
test('un paiement partiel s\'impute aux dépenses les plus anciennes en premier (FIFO)', () => {
  const people = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];
  const expenses = [
    { id: 'e1', groupId: 'g', label: 'e1', amount: 40, paidBy: 'b', date: '2026-01-01', participants: ['a'], overrides: {} },
    { id: 'e2', groupId: 'g', label: 'e2', amount: 60, paidBy: 'b', date: '2026-01-05', participants: ['a'], overrides: {} },
  ];
  // A doit 40 (e1) + 60 (e2) = 100 à B. A rembourse 50 : doit éponger e1 en entier (40) puis 10 sur e2.
  const payments = [
    { id: 'p1', from: 'a', to: 'b', amount: 50, date: '2026-01-10', groupId: 'g' },
  ];
  const statuses = calc.computeExpenseStatuses(people, expenses, payments);
  assert.strictEqual(statuses.e1.status, 'remboursée', 'e1 doit être totalement remboursée en premier');
  close(statuses.e1.remaining, 0, 'e1 remaining');
  assert.strictEqual(statuses.e2.status, 'partiellement remboursée', 'e2 doit être partiellement remboursée');
  close(statuses.e2.remaining, 50, 'e2 remaining (60 - 10 imputés)');
});

// --- Cas complémentaires : statuts et acomptes à des tiers ---
test('une dépense personnelle (payeur seul participant) a le statut "personnelle"', () => {
  const people = [{ id: 'a', name: 'A' }];
  const expenses = [{ id: 'e1', groupId: 'g', label: 'café', amount: 5, paidBy: 'a', date: '2026-01-01', participants: ['a'], overrides: {} }];
  const statuses = calc.computeExpenseStatuses(people, expenses, []);
  assert.strictEqual(statuses.e1.status, 'personnelle');
});

test('computePendingShare répartit le solde restant dû sur un acompte versé à un tiers', () => {
  const people = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];
  // acompte de 500 sur 1000 : reste 500 à répartir à parts égales -> 250 chacun
  const expenses = [
    { id: 'e1', groupId: 'g', label: 'hébergement', amount: 1000, paidExternal: 500, paidBy: 'a', date: '2026-01-01', participants: ['a', 'b'], overrides: {} },
  ];
  close(calc.computePendingShare(people, expenses, 'a'), 250, 'part de A sur le solde restant dû');
  close(calc.computePendingShare(people, expenses, 'b'), 250, 'part de B sur le solde restant dû');
});

test('simplify minimise le nombre de transactions entre créditeurs et débiteurs', () => {
  const debts = { 'a|c': 30, 'b|c': 20 }; // c a payé pour a (30) et pour b (20) -> a et b doivent à c
  const txns = calc.simplify(debts, ['a', 'b', 'c']);
  const total = txns.reduce((s, t) => s + t.amount, 0);
  close(total, 50, 'montant total simplifié conservé');
  txns.forEach(t => assert.strictEqual(t.to, 'c', 'tous les transferts doivent aller vers le créditeur c'));
});

console.log(`\n${passed} test(s) réussi(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
