/**
 * Moteur de calcul kotikota — porté fidèlement depuis le prototype de design
 * (Depenses App.dc.html, classe Component). Fonctions pures, sans dépendance
 * DOM, utilisables côté client comme côté serveur.
 *
 * Modèle de coefficient (brief "Gestion des foyers, personnes à charge et
 * parts pondérées") : chaque participant a un poids relatif (`shareWeight`,
 * 1 = part entière par défaut). La part de chacun sur une dépense est
 * proportionnelle à son poids par rapport à la somme des poids de tous les
 * participants — pas un pourcentage absolu de la dépense. Une personne à
 * charge (`guardianId` défini) voit sa dette automatiquement fusionnée avec
 * celle de son responsable (cf. `responsibleFor`) : elle n'apparaît jamais
 * comme débitrice/créancière dans les soldes finaux.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KotikotaCalc = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function findPerson(people, id) {
    return people.find(function (p) { return p.id === id; });
  }

  function weightFor(person) {
    return person.shareWeight != null ? person.shareWeight : 1;
  }

  /**
   * Part de chaque participant sur un montant donné, proportionnelle à son
   * poids relatif (shareWeight) par rapport à la somme des poids de tous
   * les participants. Retourne { [participantId]: montant }.
   */
  function computeShares(amount, participantIds, people) {
    var parts = participantIds.map(function (pid) {
      var p = findPerson(people, pid);
      return { pid: pid, weight: weightFor(p) };
    });
    var totalWeight = parts.reduce(function (s, x) { return s + x.weight; }, 0) || 1;
    var unit = amount / totalWeight;
    var shares = {};
    parts.forEach(function (part) { shares[part.pid] = unit * part.weight; });
    return shares;
  }

  /**
   * Responsable du paiement de la part d'un participant : override ponctuel
   * pour cette dépense précise, sinon son responsable permanent (guardian —
   * personne à charge), sinon lui-même. C'est ce mécanisme qui fusionne
   * automatiquement la dette d'une personne à charge avec celle de son
   * responsable partout dans le moteur de calcul.
   */
  function responsibleFor(expense, participantId, person) {
    return (expense.overrides && expense.overrides[participantId]) || person.guardianId || participantId;
  }

  function netFromDebt(debt) {
    var net = {};
    var seen = {};
    Object.keys(debt).forEach(function (key) {
      var parts = key.split('|');
      var a = parts[0], b = parts[1];
      var pairKey = [a, b].sort().join('|');
      if (seen[pairKey]) return;
      seen[pairKey] = true;
      var ab = debt[a + '|' + b] || 0;
      var ba = debt[b + '|' + a] || 0;
      var diff = ab - ba;
      if (diff > 0.005) net[a + '|' + b] = diff;
      else if (diff < -0.005) net[b + '|' + a] = -diff;
    });
    return net;
  }

  /**
   * Dette brute cumulée par paire (responsable -> payeur), réduite par les
   * paiements enregistrés (sens inverse), puis réduite à une dette nette
   * signée par paire.
   */
  function computeDebts(people, expenses, payments) {
    var debt = {};
    function add(a, b, amt) {
      if (a === b || amt <= 0) return;
      var k = a + '|' + b;
      debt[k] = (debt[k] || 0) + amt;
    }
    expenses.forEach(function (e) {
      var effAmount = e.paidExternal != null ? e.paidExternal : e.amount;
      var shares = computeShares(effAmount, e.participants, people);
      e.participants.forEach(function (pid) {
        var p = findPerson(people, pid);
        var responsible = responsibleFor(e, pid, p);
        add(responsible, e.paidBy, shares[pid]);
      });
    });
    payments.forEach(function (pay) { add(pay.to, pay.from, pay.amount); });
    return netFromDebt(debt);
  }

  function computeDebtsForGroup(people, expenses, payments, groupId) {
    return computeDebts(
      people,
      expenses.filter(function (e) { return e.groupId === groupId; }),
      payments.filter(function (p) { return p.groupId === groupId; })
    );
  }

  function netBalanceFor(personId, debts) {
    var bal = 0;
    Object.keys(debts).forEach(function (key) {
      var parts = key.split('|');
      var a = parts[0], b = parts[1];
      if (a === personId) bal -= debts[key];
      if (b === personId) bal += debts[key];
    });
    return bal;
  }

  function pairNet(a, b, debts) {
    if (debts[a + '|' + b]) return -debts[a + '|' + b];
    if (debts[b + '|' + a]) return debts[b + '|' + a];
    return 0;
  }

  /** Algorithme glouton créditeurs/débiteurs pour minimiser le nombre de transactions. */
  function simplify(debts, members) {
    var nets = {};
    members.forEach(function (m) { nets[m] = 0; });
    Object.keys(debts).forEach(function (key) {
      var parts = key.split('|');
      var a = parts[0], b = parts[1];
      nets[a] = (nets[a] || 0) - debts[key];
      nets[b] = (nets[b] || 0) + debts[key];
    });
    var creditors = Object.entries(nets)
      .filter(function (e) { return e[1] > 0.5; })
      .map(function (e) { return { id: e[0], amt: e[1] }; })
      .sort(function (a, b) { return b.amt - a.amt; });
    var debtors = Object.entries(nets)
      .filter(function (e) { return e[1] < -0.5; })
      .map(function (e) { return { id: e[0], amt: -e[1] }; })
      .sort(function (a, b) { return b.amt - a.amt; });
    var txns = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var amt = Math.min(debtors[i].amt, creditors[j].amt);
      txns.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
      debtors[i].amt -= amt;
      creditors[j].amt -= amt;
      if (debtors[i].amt < 0.5) i++;
      if (creditors[j].amt < 0.5) j++;
    }
    return txns;
  }

  /**
   * Statut de remboursement par dépense : imputation FIFO chronologique des
   * paiements aux dépenses, par paire responsable -> payeur.
   * Retourne { [expenseId]: { owed, remaining, status, color, bg } }.
   */
  function computeExpenseStatuses(people, expenses, payments) {
    var sortedExpenses = expenses.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var ledger = {};
    var expenseOwed = {};
    sortedExpenses.forEach(function (e) {
      var effAmount = e.paidExternal != null ? e.paidExternal : e.amount;
      var shares = computeShares(effAmount, e.participants, people);
      var owedTotal = 0;
      e.participants.forEach(function (pid) {
        var share = shares[pid];
        var p = findPerson(people, pid);
        var responsible = responsibleFor(e, pid, p);
        if (responsible !== e.paidBy) {
          owedTotal += share;
          var key = responsible + '|' + e.paidBy;
          if (!ledger[key]) ledger[key] = [];
          ledger[key].push({ expenseId: e.id, remaining: share });
        }
      });
      expenseOwed[e.id] = owedTotal;
    });
    var sortedPayments = payments.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    sortedPayments.forEach(function (pay) {
      var key = pay.from + '|' + pay.to;
      var amt = pay.amount;
      var entries = ledger[key] || [];
      for (var idx = 0; idx < entries.length; idx++) {
        if (amt <= 0) break;
        var entry = entries[idx];
        var use = Math.min(entry.remaining, amt);
        entry.remaining -= use;
        amt -= use;
      }
    });
    var remainingByExpense = {};
    Object.keys(ledger).forEach(function (key) {
      ledger[key].forEach(function (entry) {
        remainingByExpense[entry.expenseId] = (remainingByExpense[entry.expenseId] || 0) + entry.remaining;
      });
    });
    var statuses = {};
    sortedExpenses.forEach(function (e) {
      var owed = expenseOwed[e.id] || 0;
      var remaining = remainingByExpense[e.id] || 0;
      var status, color, bg;
      if (owed < 0.5) { status = 'personnelle'; color = 'var(--status-neutral)'; bg = 'var(--status-neutral-bg)'; }
      else if (remaining < 0.5) { status = 'remboursée'; color = 'var(--status-positive)'; bg = 'var(--status-positive-bg)'; }
      else if (remaining >= owed - 0.5) { status = 'non remboursée'; color = 'var(--status-danger)'; bg = 'var(--status-danger-bg)'; }
      else { status = 'partiellement remboursée'; color = 'var(--status-warning)'; bg = 'var(--status-warning-bg)'; }
      statuses[e.id] = { owed: owed, remaining: remaining, status: status, color: color, bg: bg };
    });
    return statuses;
  }

  /**
   * Part de personId restant à répartir sur des acomptes versés à des tiers
   * (paidExternal < amount) qui ne sont pas encore marqués réglés.
   */
  function computePendingShare(people, expenses, personId) {
    var pending = 0;
    expenses.forEach(function (e) {
      var effAmount = e.paidExternal != null ? e.paidExternal : e.amount;
      var dueExternal = e.amount - effAmount;
      if (dueExternal < 0.5) return;
      var shares = computeShares(dueExternal, e.participants, people);
      e.participants.forEach(function (pid) {
        var p = findPerson(people, pid);
        var responsible = responsibleFor(e, pid, p);
        if (responsible === personId) pending += shares[pid];
      });
    });
    return pending;
  }

  function colorForBalance(n) {
    if (n > 0.5) return 'var(--status-positive)';
    if (n < -0.5) return 'var(--status-danger)';
    return 'var(--status-neutral)';
  }

  return {
    findPerson: findPerson,
    weightFor: weightFor,
    computeShares: computeShares,
    responsibleFor: responsibleFor,
    computeDebts: computeDebts,
    computeDebtsForGroup: computeDebtsForGroup,
    netBalanceFor: netBalanceFor,
    pairNet: pairNet,
    simplify: simplify,
    computeExpenseStatuses: computeExpenseStatuses,
    computePendingShare: computePendingShare,
    colorForBalance: colorForBalance,
  };
}));
