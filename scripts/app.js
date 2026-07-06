/**
 * kotikota — application de suivi des dépenses entre amis.
 * Port fidèle de l'UI et des interactions du prototype de design
 * (design_handoff_expense_tracker/Depenses App.dc.html) en HTML/CSS/JS
 * vanilla. Le moteur de calcul est isolé dans scripts/calc.js (testé
 * séparément, cf. tests/calc.test.js).
 *
 * Persistance : localStorage, en attendant une vraie base + API (cf.
 * README, section "Ce qui reste à faire").
 */
(function () {
  'use strict';

  var calc = window.KotikotaCalc;
  var seed = window.KotikotaData;
  var STORAGE_KEY = 'kotikota-state-v1';

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function defaultState() {
    return {
      screen: 'home',
      navStack: [],
      theme: 'dark',
      loggedIn: false,
      loginMode: 'password',
      loginForm: { email: '', password: '' },
      loginError: null,
      magicSent: false,
      currentUserId: 'moi',
      showSwitchUser: false,
      showManageMembers: false,
      manageMembersGroupId: null,
      selectedGroupId: null,
      selectedPersonId: null,
      people: seed.PEOPLE,
      groups: [],
      expenses: [],
      payments: [],
      reminders: [],
      toast: null,
      showAddExpense: false,
      showAddGroup: false,
      showSettle: false,
      form: { label: '', amount: '', groupId: null, paidBy: 'moi', participantIds: [], overrides: {} },
      groupForm: { name: '', memberIds: ['moi'] },
      settleForm: { from: null, to: null, amount: '' },
      formError: null,
    };
  }

  var PERSISTED_KEYS = ['theme', 'currentUserId', 'people', 'groups', 'expenses', 'payments', 'reminders', 'loggedIn'];

  function loadState() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        PERSISTED_KEYS.forEach(function (k) {
          if (saved[k] !== undefined) base[k] = saved[k];
        });
      }
    } catch (err) {
      /* localStorage indisponible ou corrompu : on repart des données de départ */
    }
    return base;
  }

  function persist() {
    var toSave = {};
    PERSISTED_KEYS.forEach(function (k) { toSave[k] = state[k]; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch (err) { /* quota / mode privé */ }
  }

  var state = loadState();
  var toastTimer = null;

  function setState(patch) {
    var partial = typeof patch === 'function' ? patch(state) : patch;
    state = Object.assign({}, state, partial);
    persist();
    render();
  }

  // ---------- Helpers métier (portés du prototype) ----------

  function person(id) { return calc.findPerson(state.people, id); }
  function group(id) { return state.groups.find(function (g) { return g.id === id; }); }
  function currencySymbol() { return '€'; }
  function fmt(n) {
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(n).toFixed(2).replace('.', ',');
    return sign + v + ' ' + currencySymbol();
  }
  function initials(name) { return name.slice(0, 2).toUpperCase(); }
  function colorForBalance(n) { return calc.colorForBalance(n); }

  function computeDebts() { return calc.computeDebts(state.people, state.expenses, state.payments); }
  function computeDebtsForGroup(groupId) { return calc.computeDebtsForGroup(state.people, state.expenses, state.payments, groupId); }
  function netBalanceFor(personId, groupIdFilter) {
    var debts = groupIdFilter ? computeDebtsForGroup(groupIdFilter) : computeDebts();
    return calc.netBalanceFor(personId, debts);
  }
  function pairNet(a, b, debts) { return calc.pairNet(a, b, debts || computeDebts()); }

  function showToast(msg) {
    clearTimeout(toastTimer);
    setState({ toast: msg });
    toastTimer = setTimeout(function () {
      setState(function (s) { return s.toast === msg ? { toast: null } : {}; });
    }, 2600);
  }

  // ---------- Navigation ----------
  function navigate(screen, extra) {
    setState(function (s) {
      return Object.assign({}, extra, { screen: screen, navStack: s.navStack.concat([s.screen]) });
    });
  }
  function goBack() {
    setState(function (s) {
      var stack = s.navStack.slice();
      var prev = stack.pop() || 'home';
      return { screen: prev, navStack: stack };
    });
  }
  function goHome() { setState({ screen: 'home', navStack: [] }); }
  function goGroups() { setState({ screen: 'groups', navStack: [] }); }
  function goHistory() { setState({ screen: 'history', navStack: [] }); }
  function goExpenses() { setState({ screen: 'expenses', navStack: [] }); }
  function openGroup(id) { navigate('groupDetail', { selectedGroupId: id }); }
  function openPerson(id) { navigate('person', { selectedPersonId: id }); }
  function toggleTheme() { setState(function (s) { return { theme: s.theme === 'dark' ? 'light' : 'dark' }; }); }

  // ---------- Login ----------
  function toggleLoginMode() { setState(function (s) { return { loginMode: s.loginMode === 'password' ? 'magic' : 'password', loginError: null, magicSent: false }; }); }
  function setLoginEmail(v) { setState(function (s) { return { loginForm: Object.assign({}, s.loginForm, { email: v }), loginError: null }; }); }
  function setLoginPassword(v) { setState(function (s) { return { loginForm: Object.assign({}, s.loginForm, { password: v }), loginError: null }; }); }
  function submitLogin() {
    var f = state.loginForm;
    if (!f.email.trim() || f.email.indexOf('@') === -1) { setState({ loginError: 'entre un e-mail valide.' }); return; }
    if (!f.password || f.password.length < 4) { setState({ loginError: 'mot de passe trop court.' }); return; }
    setState({ loggedIn: true, loginError: null });
    showToast('connecté');
  }
  function submitMagicLink() {
    var f = state.loginForm;
    if (!f.email.trim()) { setState({ loginError: 'entre un e-mail ou un numéro.' }); return; }
    setState({ magicSent: true, loginError: null });
  }
  function submitMagicContinue() { setState({ loggedIn: true }); showToast('connecté'); }

  // ---------- Reminders / settle ----------
  function sendReminder(personId) {
    var p = person(personId);
    var rel = pairNet(state.currentUserId, personId);
    var amt = rel < 0 ? -rel : 0;
    var msg = 'petit rappel à ' + p.name + ' — psst, tu me dois encore ' + fmt(amt);
    var reminder = { id: 'r' + Date.now(), toPersonId: personId, amount: amt, date: new Date().toISOString().slice(0, 10), message: msg };
    setState(function (s) { return { reminders: s.reminders.concat([reminder]) }; });
    showToast('rappel envoyé à ' + p.name);
  }
  function openSettle(personId) {
    var me = state.currentUserId;
    var bal = pairNet(me, personId);
    var from = bal < 0 ? personId : me;
    var to = bal < 0 ? me : personId;
    setState({ showSettle: true, settleForm: { from: from, to: to, amount: Math.abs(bal).toFixed(2).replace('.', ',') } });
  }
  function setSettleAmount(v) { setState(function (s) { return { settleForm: Object.assign({}, s.settleForm, { amount: v }) }; }); }
  function submitSettle() {
    var sf = state.settleForm;
    var amt = parseFloat((sf.amount || '').replace(',', '.'));
    if (!amt || amt <= 0) return;
    var payment = { id: 'p' + Date.now(), from: sf.from, to: sf.to, amount: amt, date: new Date().toISOString().slice(0, 10), groupId: null };
    setState(function (s) { return { payments: s.payments.concat([payment]), showSettle: false }; });
    showToast('paiement enregistré');
  }

  // ---------- Expenses ----------
  function openAddExpense(groupId) {
    var g = groupId ? group(groupId) : state.groups[0];
    if (!g) { showToast('crée d\'abord un groupe pour ajouter une dépense'); return; }
    var overrides = {};
    g.memberIds.forEach(function (pid) { if (person(pid).defaultCoveredBy) overrides[pid] = person(pid).defaultCoveredBy; });
    setState({
      showAddExpense: true,
      formError: null,
      form: { editingId: null, label: '', amount: '', groupId: g.id, paidBy: state.currentUserId, participantIds: g.memberIds.slice(), overrides: overrides, fullyPaid: true, paidExternal: '' },
    });
  }
  function openEditExpense(expenseId) {
    var e = state.expenses.find(function (x) { return x.id === expenseId; });
    if (!e) return;
    var fullyPaid = (e.paidExternal != null ? e.paidExternal : e.amount) >= e.amount - 0.005;
    setState({
      showAddExpense: true,
      formError: null,
      form: {
        editingId: e.id, label: e.label, amount: String(e.amount).replace('.', ','), groupId: e.groupId, paidBy: e.paidBy,
        participantIds: e.participants.slice(), overrides: Object.assign({}, e.overrides || {}),
        fullyPaid: fullyPaid, paidExternal: fullyPaid ? '' : String(e.paidExternal != null ? e.paidExternal : 0).replace('.', ','),
      },
    });
  }
  function deleteExpense() {
    var id = state.form.editingId;
    if (!id) return;
    setState(function (s) { return { expenses: s.expenses.filter(function (e) { return e.id !== id; }), showAddExpense: false }; });
    showToast('dépense supprimée');
  }
  function markExpensePaidFull(expenseId) {
    setState(function (s) { return { expenses: s.expenses.map(function (e) { return e.id === expenseId ? Object.assign({}, e, { paidExternal: e.amount }) : e; }) }; });
    showToast('marqué comme réglé en totalité');
  }
  function toggleFullyPaid() { setState(function (s) { return { form: Object.assign({}, s.form, { fullyPaid: !s.form.fullyPaid }) }; }); }
  function setPaidExternal(v) { setState(function (s) { return { form: Object.assign({}, s.form, { paidExternal: v }) }; }); }
  function setLabel(v) { setState(function (s) { return { form: Object.assign({}, s.form, { label: v }) }; }); }
  function setAmount(v) { setState(function (s) { return { form: Object.assign({}, s.form, { amount: v }) }; }); }
  function selectGroupForForm(groupId) {
    var g = group(groupId);
    var overrides = {};
    g.memberIds.forEach(function (pid) { if (person(pid).defaultCoveredBy) overrides[pid] = person(pid).defaultCoveredBy; });
    setState(function (s) { return { form: Object.assign({}, s.form, { groupId: groupId, participantIds: g.memberIds.slice(), overrides: overrides }) }; });
  }
  function selectPayer(pid) { setState(function (s) { return { form: Object.assign({}, s.form, { paidBy: pid }) }; }); }
  function toggleParticipant(pid) {
    setState(function (s) {
      var has = s.form.participantIds.indexOf(pid) !== -1;
      var participantIds = has ? s.form.participantIds.filter(function (x) { return x !== pid; }) : s.form.participantIds.concat([pid]);
      return { form: Object.assign({}, s.form, { participantIds: participantIds }) };
    });
  }
  function setOverride(pid, v) {
    setState(function (s) {
      var overrides = Object.assign({}, s.form.overrides);
      if (v === 'self') delete overrides[pid];
      else overrides[pid] = v;
      return { form: Object.assign({}, s.form, { overrides: overrides }) };
    });
  }
  function submitExpense() {
    var f = state.form;
    var amt = parseFloat((f.amount || '').replace(',', '.'));
    if (!f.label.trim()) { setState({ formError: 'ajoute une description.' }); return; }
    if (!amt || amt <= 0) { setState({ formError: 'montant invalide.' }); return; }
    if (f.participantIds.length === 0) { setState({ formError: 'sélectionne au moins un participant.' }); return; }
    var g = group(f.groupId);
    var paidExternal = amt;
    if (!f.fullyPaid) {
      var pe = parseFloat((f.paidExternal || '').replace(',', '.'));
      paidExternal = isNaN(pe) ? 0 : Math.max(0, Math.min(amt, pe));
    }
    if (f.editingId) {
      setState(function (s) {
        return {
          expenses: s.expenses.map(function (e) {
            return e.id === f.editingId ? Object.assign({}, e, {
              groupId: f.groupId, label: f.label.trim(), amount: amt, paidExternal: paidExternal,
              paidBy: f.paidBy, participants: f.participantIds.slice(), overrides: Object.assign({}, f.overrides),
            }) : e;
          }),
          showAddExpense: false,
        };
      });
      showToast('dépense modifiée');
      return;
    }
    var expense = {
      id: 'e' + Date.now(), groupId: f.groupId, label: f.label.trim(), icon: 'ph-bold ph-receipt', amount: amt, paidExternal: paidExternal,
      paidBy: f.paidBy, date: new Date().toISOString().slice(0, 10), participants: f.participantIds.slice(), overrides: Object.assign({}, f.overrides),
    };
    setState(function (s) { return { expenses: s.expenses.concat([expense]), showAddExpense: false }; });
    showToast('dépense ajoutée à ' + g.name);
  }

  // ---------- Groups ----------
  function openAddGroup() { setState({ showAddGroup: true, groupForm: { name: '', memberIds: [state.currentUserId] } }); }
  function setGroupName(v) { setState(function (s) { return { groupForm: Object.assign({}, s.groupForm, { name: v }) }; }); }
  function toggleGroupMember(pid) {
    setState(function (s) {
      var has = s.groupForm.memberIds.indexOf(pid) !== -1;
      var memberIds = has ? s.groupForm.memberIds.filter(function (x) { return x !== pid; }) : s.groupForm.memberIds.concat([pid]);
      return { groupForm: Object.assign({}, s.groupForm, { memberIds: memberIds }) };
    });
  }
  function submitGroup() {
    var gf = state.groupForm;
    if (!gf.name.trim()) { showToast('donne un nom au groupe.'); return; }
    var newGroup = { id: 'g' + Date.now(), name: gf.name.trim(), icon: 'ph-bold ph-users-three', memberIds: gf.memberIds.slice(), adminId: state.currentUserId };
    setState(function (s) { return { groups: s.groups.concat([newGroup]), showAddGroup: false }; });
    showToast('groupe créé');
  }
  function deleteGroup(groupId) {
    setState(function (s) { return { groups: s.groups.filter(function (g) { return g.id !== groupId; }), screen: 'groups', navStack: [] }; });
    showToast('groupe supprimé');
  }
  function openManageMembers(groupId) { setState({ showManageMembers: true, manageMembersGroupId: groupId }); }
  function toggleManageMember(groupId, personId) {
    var g = group(groupId);
    if (personId === g.adminId) return;
    setState(function (s) {
      return {
        groups: s.groups.map(function (gr) {
          if (gr.id !== groupId) return gr;
          var has = gr.memberIds.indexOf(personId) !== -1;
          return Object.assign({}, gr, { memberIds: has ? gr.memberIds.filter(function (x) { return x !== personId; }) : gr.memberIds.concat([personId]) });
        }),
      };
    });
  }
  function setChildPercent(personId, value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return;
    n = Math.max(0, Math.min(100, n));
    setState(function (s) { return { people: s.people.map(function (p) { return p.id === personId ? Object.assign({}, p, { childPercent: n }) : p; }) }; });
  }

  // ---------- User switch / modals ----------
  function openSwitchUser() { setState({ showSwitchUser: true }); }
  function switchUser(personId) {
    setState({ currentUserId: personId, showSwitchUser: false, screen: 'home', navStack: [] });
    showToast('connecté en tant que ' + person(personId).name);
  }
  function closeModal() { setState({ showAddExpense: false, showAddGroup: false, showSettle: false, showSwitchUser: false, showManageMembers: false, formError: null }); }

  // ---------- Rendu ----------

  function captureFocus(root) {
    var active = document.activeElement;
    if (!active || !root.contains(active)) return null;
    var bind = active.getAttribute('data-bind') || active.getAttribute('data-bind-change');
    if (!bind) return null;
    return {
      bind: bind,
      id: active.getAttribute('data-id'),
      selStart: active.selectionStart,
      selEnd: active.selectionEnd,
    };
  }

  function restoreFocus(root, info) {
    if (!info) return;
    var attr = 'data-bind';
    var el = root.querySelector('[' + attr + '="' + info.bind + '"]' + (info.id ? '[data-id="' + info.id + '"]' : ''));
    if (!el) el = root.querySelector('[data-bind-change="' + info.bind + '"]' + (info.id ? '[data-id="' + info.id + '"]' : ''));
    if (!el) return;
    el.focus();
    if (typeof info.selStart === 'number' && el.setSelectionRange) {
      try { el.setSelectionRange(info.selStart, info.selEnd); } catch (err) { /* input type sans sélection texte */ }
    }
  }

  function render() {
    var root = document.getElementById('app');
    var focusInfo = captureFocus(root);
    root.setAttribute('data-theme', state.theme);
    root.innerHTML = state.loggedIn ? renderApp() : renderLogin();
    bindEvents(root);
    restoreFocus(root, focusInfo);
  }

  function renderLogin() {
    var f = state.loginForm;
    var body = '';
    if (state.loginMode === 'password') {
      body =
        '<div class="field-label">e-mail</div>' +
        '<input class="text-input" data-bind="loginEmail" placeholder="toi@exemple.com" value="' + escapeHtml(f.email) + '" />' +
        '<div class="field-label">mot de passe</div>' +
        '<input class="text-input" type="password" data-bind="loginPassword" placeholder="••••••••" value="' + escapeHtml(f.password) + '" />' +
        '<div class="link-right">mot de passe oublié ?</div>' +
        '<button class="btn-primary pressable" data-action="submitLogin">se connecter</button>' +
        (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
        '<div class="divider-or">ou</div>' +
        '<div class="link-center" data-action="toggleLoginMode">se connecter sans mot de passe →</div>';
    } else if (state.magicSent) {
      body =
        '<div class="magic-confirm">' +
        '<div class="magic-icon"><i class="ph-bold ph-paper-plane-tilt"></i></div>' +
        '<div class="login-title" style="font-size:20px">lien envoyé !</div>' +
        '<div class="login-subtitle" style="line-height:1.5">clique sur le lien reçu par e-mail pour continuer — pour ce prototype, ça te connecte directement</div>' +
        '<button class="btn-primary pressable" style="margin-top:20px;width:auto;padding:12px 20px" data-action="submitMagicContinue">continuer</button>' +
        '</div>';
    } else {
      body =
        '<div class="field-label">e-mail ou numéro</div>' +
        '<input class="text-input" data-bind="loginEmail" placeholder="toi@exemple.com" value="' + escapeHtml(f.email) + '" />' +
        '<button class="btn-primary pressable" data-action="submitMagicLink">envoyer le lien</button>' +
        (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
        '<div class="link-center" style="margin-top:20px" data-action="toggleLoginMode">se connecter avec un mot de passe →</div>';
    }
    return (
      '<div class="login-screen">' +
      '<div class="login-icon"><i class="ph-bold ph-piggy-bank"></i></div>' +
      '<div class="login-title">se connecter</div>' +
      '<div class="login-subtitle">retrouve tes groupes et vos comptes</div>' +
      body +
      '</div>'
    );
  }

  function renderApp() {
    return (
      renderTopBar() +
      '<div class="content">' + renderContent() + '</div>' +
      renderBottomNav() +
      renderModals() +
      renderToast()
    );
  }

  function renderTopBar() {
    var showBack = state.screen !== 'home' && state.screen !== 'groups' && state.screen !== 'history' && state.screen !== 'expenses';
    var showAddButton = state.screen === 'home' || state.screen === 'groups' || state.screen === 'expenses';
    var titles = { home: 'mes dépenses', groups: 'groupes', history: 'historique', expenses: 'dépenses', person: 'détail' };
    var title = titles[state.screen];
    var subtitle = '';
    if (state.screen === 'groupDetail') {
      var g = group(state.selectedGroupId);
      title = g ? g.name : '';
      subtitle = g ? 'admin : ' + person(g.adminId).name : '';
    }
    var cu = person(state.currentUserId);
    return (
      '<div class="top-bar">' +
      (showBack ? '<button class="icon-btn pressable" data-action="goBack"><i class="ph-bold ph-arrow-left"></i></button>' : '') +
      '<div style="flex:1">' +
      '<div class="top-title">' + escapeHtml(title) + '</div>' +
      (subtitle ? '<div class="top-subtitle">' + escapeHtml(subtitle) + '</div>' : '') +
      '</div>' +
      '<button class="icon-btn small pressable" data-action="toggleTheme">' +
      '<i class="ph-bold ' + (state.theme === 'dark' ? 'ph-sun' : 'ph-moon') + '"></i></button>' +
      (showAddButton ? '<button class="icon-btn small brand pressable" data-action="openAddExpenseGlobal"><i class="ph-bold ph-plus"></i></button>' : '') +
      '</div>'
    );
  }

  function renderContent() {
    switch (state.screen) {
      case 'home': return renderHome();
      case 'groups': return renderGroups();
      case 'groupDetail': return renderGroupDetail();
      case 'person': return renderPersonDetail();
      case 'expenses': return renderAllExpenses();
      case 'history': return renderHistory();
      default: return '';
    }
  }

  function renderHome() {
    var moi = state.currentUserId;
    var cu = person(moi);
    var globalDebts = computeDebts();
    var otherPeople = state.people.filter(function (p) { return p.id !== moi; });
    var pendingShare = calc.computePendingShare(state.people, state.expenses, moi);

    var owed = 0, owe = 0;
    var rows = otherPeople.map(function (p) {
      var bal = pairNet(moi, p.id, globalDebts);
      if (bal > 0) owed += bal; else owe += -bal;
      var covered = p.defaultCoveredBy ? person(p.defaultCoveredBy) : null;
      var amountLabel = Math.abs(bal) < 0.5 ? 'à jour' : (bal > 0 ? 'te doit ' + fmt(bal) : 'tu dois ' + fmt(-bal));
      return (
        '<button class="person-row pressable" data-action="openPerson" data-id="' + p.id + '">' +
        '<div class="avatar avatar-38" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
        '<div style="flex:1;min-width:0;text-align:left">' +
        '<div class="person-name">' + escapeHtml(p.name) + '</div>' +
        (p.isChild ? '<span class="badge-child">enfant · ' + p.childPercent + '%</span>' : '') +
        (covered ? '<div class="covered-note">pris en charge par ' + escapeHtml(covered.name) + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
        '<div class="person-amount" style="color:' + colorForBalance(bal) + '">' + escapeHtml(amountLabel) + '</div>' +
        (bal > 0.5 ? '<span class="remind-link" data-action="remind" data-id="' + p.id + '">envoyer un rappel →</span>' : '') +
        '</div></button>'
      );
    }).join('');

    var sum = owed - owe;

    return (
      '<button class="current-user-row pressable" data-action="openSwitchUser">' +
      '<div class="avatar avatar-26" style="background:' + cu.color + '">' + initials(cu.name) + '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">connecté en tant que <b style="color:var(--text-primary);font-weight:700">' + escapeHtml(cu.name) + '</b></div>' +
      '<i class="ph-bold ph-caret-down" style="font-size:11px;color:var(--text-tertiary)"></i>' +
      '</button>' +
      '<div class="balance-card">' +
      '<div class="balance-label">solde net total</div>' +
      '<div class="balance-amount" style="color:' + colorForBalance(sum) + '">' + (sum >= 0 ? '+' : '-') + fmt(Math.abs(sum)).replace('-', '') + '</div>' +
      '<div class="balance-detail-row"><div class="owed">on te doit ' + fmt(owed).replace('-', '') + '</div><div class="owe">tu dois ' + fmt(owe).replace('-', '') + '</div></div>' +
      '</div>' +
      (pendingShare > 0.5 ?
        '<div class="warning-banner"><div class="warning-banner-title"><i class="ph-bold ph-clock-countdown"></i> à anticiper</div>' +
        '<div class="warning-banner-body">Ta part (' + fmt(pendingShare) + ') sur des acomptes pas encore soldés à des tiers.</div></div>' : '') +
      '<div class="section-label">par personne</div>' +
      rows
    );
  }

  function renderGroups() {
    var moi = state.currentUserId;
    var cards = state.groups.map(function (g) {
      var bal = netBalanceFor(moi, g.id);
      var names = g.memberIds.map(function (id) { return person(id).name; }).join(', ');
      var summary = Math.abs(bal) < 0.5 ? 'équilibré' : (bal > 0 ? '+' + fmt(bal) : fmt(bal));
      return (
        '<button class="group-card pressable" data-action="openGroup" data-id="' + g.id + '">' +
        '<div class="group-icon"><i class="' + g.icon + '"></i></div>' +
        '<div style="flex:1;text-align:left">' +
        '<div class="group-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="group-members">' + escapeHtml(names) + '</div>' +
        '</div>' +
        '<div class="group-summary" style="color:' + colorForBalance(bal) + '">' + summary + '</div>' +
        '</button>'
      );
    }).join('');
    return cards + '<button class="dashed-btn pressable" data-action="openAddGroup">+ nouveau groupe / événement</button>';
  }

  function renderGroupDetail() {
    var g = group(state.selectedGroupId);
    if (!g) return '';
    var moi = state.currentUserId;
    var isAdmin = g.adminId === moi;
    var debts = computeDebtsForGroup(g.id);

    var memberRows = g.memberIds.map(function (pid) {
      var p = person(pid);
      var paid = state.expenses.filter(function (e) { return e.groupId === g.id && e.paidBy === pid; })
        .reduce(function (a, e) { return a + (e.paidExternal != null ? e.paidExternal : e.amount); }, 0);
      var share = 0;
      state.expenses.filter(function (e) { return e.groupId === g.id && e.participants.indexOf(pid) !== -1; }).forEach(function (e) {
        var effAmount = e.paidExternal != null ? e.paidExternal : e.amount;
        var parts = e.participants.map(function (id2) { var pp = person(id2); return { id2: id2, weight: calc.weightFor(pp) }; });
        var totalWeight = parts.reduce(function (a, x) { return a + x.weight; }, 0) || 1;
        var unit = effAmount / totalWeight;
        var w = parts.find(function (x) { return x.id2 === pid; }).weight;
        share += unit * w;
      });
      var bal = netBalanceFor(pid, g.id);
      var covered = p.defaultCoveredBy ? person(p.defaultCoveredBy) : null;
      var balLabel = covered ? '→ ' + covered.name : (Math.abs(bal) < 0.5 ? '0,00' : fmt(bal));
      var balColor = covered ? 'var(--status-neutral)' : colorForBalance(bal);
      return (
        '<div class="member-row">' +
        '<div class="avatar avatar-30" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
        '<div class="col-name">' + escapeHtml(p.name) + (p.isChild ? '<span class="badge-child inline">' + p.childPercent + '%</span>' : '') + '</div>' +
        '<div class="col-num">' + fmt(paid) + '</div>' +
        '<div class="col-num">' + fmt(share) + '</div>' +
        '<div class="col-bal" style="color:' + balColor + '">' + escapeHtml(balLabel) + '</div>' +
        '</div>'
      );
    }).join('');

    var txns = calc.simplify(debts, g.memberIds);
    var suggestions = txns.map(function (t) {
      return '<div class="suggestion-row"><div><b>' + escapeHtml(person(t.from).name) + '</b> → <b>' + escapeHtml(person(t.to).name) + '</b></div>' +
        '<div class="suggestion-amount">' + fmt(t.amount) + '</div></div>';
    }).join('');

    var expenseRows = state.expenses.filter(function (e) { return e.groupId === g.id; })
      .slice().sort(function (a, b) { return b.date.localeCompare(a.date); })
      .map(function (e) {
        return (
          '<div class="expense-row pressable" data-action="editExpense" data-id="' + e.id + '">' +
          '<div class="expense-icon"><i class="' + e.icon + '"></i></div>' +
          '<div style="flex:1;min-width:0">' +
          '<div class="expense-label">' + escapeHtml(e.label) + '</div>' +
          '<div class="expense-subtitle">payé par ' + escapeHtml(person(e.paidBy).name) + ' · ' + fmtDate(e.date) + ' · ' + e.participants.length + ' pers.</div>' +
          '</div><div class="expense-amount">' + fmt(e.amount) + '</div></div>'
        );
      }).join('');

    return (
      '<div class="member-table"><div class="section-label">payé / part / solde</div>' + memberRows + '</div>' +
      (isAdmin ?
        '<div class="admin-actions">' +
        '<button class="btn-outline pressable" data-action="openManageMembers" data-id="' + g.id + '"><i class="ph-bold ph-users-three"></i> gérer les membres</button>' +
        '<button class="btn-icon-danger pressable" data-action="deleteGroup" data-id="' + g.id + '"><i class="ph-bold ph-trash"></i></button>' +
        '</div>' : '') +
      (txns.length ? '<div class="section-label">pour équilibrer</div>' + suggestions : '') +
      '<div class="section-label" style="margin-top:18px">dépenses</div>' + expenseRows +
      '<button class="btn-primary pressable" style="margin-top:18px" data-action="openAddExpenseForGroup">ajouter une dépense</button>'
    );
  }

  function renderPersonDetail() {
    var p = person(state.selectedPersonId);
    if (!p) return '';
    var moi = state.currentUserId;
    var bal = pairNet(moi, p.id);
    var covered = p.defaultCoveredBy ? person(p.defaultCoveredBy) : null;
    var lastReminder = state.reminders.slice().reverse().find(function (r) { return r.toPersonId === p.id; });
    var relatedExpenses = state.expenses.filter(function (e) { return e.participants.indexOf(p.id) !== -1 || e.paidBy === p.id; })
      .slice().sort(function (a, b) { return b.date.localeCompare(a.date); });

    var amountLabel = Math.abs(bal) < 0.5 ? 'à jour' : (bal > 0 ? 'te doit ' + fmt(bal) : 'tu dois ' + fmt(-bal));

    return (
      '<div class="person-header">' +
      '<div class="avatar avatar-64" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
      '<div class="person-header-name">' + escapeHtml(p.name) + '</div>' +
      (p.isChild ? '<div><span class="badge-child" style="margin-top:8px">enfant · part à ' + p.childPercent + '%</span></div>' : '') +
      (covered ? '<div class="covered-note" style="margin-top:6px">pris en charge par ' + escapeHtml(covered.name) + '</div>' : '') +
      '<div class="person-header-amount" style="color:' + colorForBalance(bal) + '">' + escapeHtml(amountLabel) + '</div>' +
      '</div>' +
      '<div class="person-actions">' +
      (bal > 0.5 ? '<button class="btn-danger-fill pressable" data-action="remind" data-id="' + p.id + '"><i class="ph-bold ph-bell-ringing" style="margin-right:6px"></i>envoyer un rappel</button>' : '') +
      '<button class="btn-outline-flex pressable" data-action="openSettle" data-id="' + p.id + '">enregistrer un paiement</button>' +
      '</div>' +
      (lastReminder ? '<div class="reminder-preview">' + escapeHtml(lastReminder.message) + '</div>' : '') +
      '<div class="section-label">dépenses concernées</div>' +
      relatedExpenses.map(function (e) {
        return '<div class="person-expense-row"><i class="' + e.icon + '" style="color:var(--text-secondary);font-size:15px;width:18px;text-align:center"></i>' +
          '<div style="flex:1;font-size:13.5px;color:var(--text-primary)">' + escapeHtml(e.label) + '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--text-secondary)">' + fmt(e.amount) + '</div></div>';
      }).join('')
    );
  }

  function renderAllExpenses() {
    var statuses = calc.computeExpenseStatuses(state.people, state.expenses, state.payments);
    var total = state.expenses.reduce(function (a, e) { return a + e.amount; }, 0);
    var totalOwed = Object.values(statuses).reduce(function (a, st) { return a + st.owed; }, 0);
    var totalRemaining = Object.values(statuses).reduce(function (a, st) { return a + st.remaining; }, 0);
    var totalDueExternal = state.expenses.reduce(function (a, e) { return a + (e.amount - (e.paidExternal != null ? e.paidExternal : e.amount)); }, 0);

    var rows = state.expenses.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (e) {
      var g = group(e.groupId);
      var st = statuses[e.id];
      var paidExternal = e.paidExternal != null ? e.paidExternal : e.amount;
      var dueExternal = e.amount - paidExternal;
      return (
        '<div class="expense-row">' +
        '<div class="expense-icon pressable" data-action="editExpense" data-id="' + e.id + '"><i class="' + e.icon + '"></i></div>' +
        '<div style="flex:1;min-width:0;cursor:pointer" data-action="editExpense" data-id="' + e.id + '">' +
        '<div class="expense-label">' + escapeHtml(e.label) + '</div>' +
        '<div class="expense-subtitle">' + (g ? escapeHtml(g.name) + ' · ' : '') + 'payé par ' + escapeHtml(person(e.paidBy).name) + ' · ' + fmtDate(e.date) + ' · ' + e.participants.length + ' pers.</div>' +
        '<div class="expense-meta-row">' +
        '<span class="status-badge" style="color:' + st.color + ';background:' + st.bg + '">' + st.status + '</span>' +
        (st.remaining > 0.5 ? '<span style="font-size:11px;color:var(--text-tertiary)">' + fmt(st.remaining) + ' restant entre vous</span>' : '') +
        '</div>' +
        (dueExternal > 0.5 ?
          '<div class="due-external">acompte versé ' + fmt(paidExternal) + ' · reste ' + fmt(dueExternal) + ' à verser au bailleur</div>' +
          '<button class="mark-paid-link" data-action="markPaidFull" data-id="' + e.id + '">marquer réglé en totalité →</button>' : '') +
        '</div>' +
        '<div class="expense-amount">' + fmt(e.amount) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="summary-cards">' +
      '<div class="summary-card"><div class="summary-card-label">total</div><div class="summary-card-value">' + fmt(total) + '</div></div>' +
      '<div class="summary-card"><div class="summary-card-label">remboursé</div><div class="summary-card-value" style="color:var(--status-positive)">' + fmt(totalOwed - totalRemaining) + '</div></div>' +
      '<div class="summary-card"><div class="summary-card-label">restant dû</div><div class="summary-card-value" style="color:var(--status-danger)">' + fmt(totalRemaining) + '</div></div>' +
      '</div>' +
      (totalDueExternal > 0.5 ? '<div class="warning-banner" style="padding:10px 14px;font-size:12.5px">' + fmt(totalDueExternal) + ' restent à verser à des tiers (acomptes non soldés)</div>' : '') +
      rows +
      '<button class="btn-primary pressable" style="margin-top:18px" data-action="openAddExpenseGlobal">ajouter une dépense</button>'
    );
  }

  function renderHistory() {
    var items = [];
    state.expenses.forEach(function (e) {
      var g = group(e.groupId);
      items.push({ date: e.date, icon: e.icon, iconBg: 'var(--surface-overlay)', iconColor: 'var(--text-secondary)', text: escapeHtml(person(e.paidBy).name) + ' a payé « ' + escapeHtml(e.label) + ' »' + (g ? ' · ' + escapeHtml(g.name) : ''), amountLabel: fmt(e.amount), color: 'var(--text-primary)' });
    });
    state.payments.forEach(function (p) {
      items.push({ date: p.date, icon: 'ph-bold ph-check-circle', iconBg: 'var(--status-positive-bg)', iconColor: 'var(--status-positive)', text: escapeHtml(person(p.from).name) + ' → ' + escapeHtml(person(p.to).name), amountLabel: fmt(p.amount), color: 'var(--status-positive)' });
    });
    state.reminders.forEach(function (r) {
      items.push({ date: r.date, icon: 'ph-bold ph-bell-ringing', iconBg: 'var(--status-danger-bg)', iconColor: 'var(--status-danger)', text: 'rappel envoyé à ' + escapeHtml(person(r.toPersonId).name), amountLabel: null, color: null });
    });
    return items.sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (h) {
      return (
        '<div class="history-row">' +
        '<div class="history-icon" style="background:' + h.iconBg + ';color:' + h.iconColor + '"><i class="' + h.icon + '"></i></div>' +
        '<div style="flex:1;min-width:0"><div class="history-text">' + h.text + '</div><div class="history-date">' + fmtDate(h.date) + '</div></div>' +
        (h.amountLabel ? '<div class="history-amount" style="color:' + h.color + '">' + h.amountLabel + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }

  function renderBottomNav() {
    function color(match) { return match ? 'var(--brand-secondary)' : 'var(--text-tertiary)'; }
    return (
      '<div class="bottom-nav">' +
      '<button class="nav-item" data-action="goHome" style="color:' + color(state.screen === 'home') + '"><i class="ph-bold ph-house" style="font-size:20px"></i><div class="nav-item-label">accueil</div></button>' +
      '<button class="nav-item" data-action="goGroups" style="color:' + color(state.screen === 'groups' || state.screen === 'groupDetail') + '"><i class="ph-bold ph-users-three" style="font-size:20px"></i><div class="nav-item-label">groupes</div></button>' +
      '<button class="nav-item" data-action="goExpenses" style="color:' + color(state.screen === 'expenses') + '"><i class="ph-bold ph-receipt" style="font-size:20px"></i><div class="nav-item-label">dépenses</div></button>' +
      '<button class="nav-item" data-action="goHistory" style="color:' + color(state.screen === 'history') + '"><i class="ph-bold ph-clock-counter-clockwise" style="font-size:20px"></i><div class="nav-item-label">historique</div></button>' +
      '</div>'
    );
  }

  function renderModals() {
    var out = '';
    if (state.showAddExpense) out += renderAddExpenseModal();
    if (state.showAddGroup) out += renderAddGroupModal();
    if (state.showSettle) out += renderSettleModal();
    if (state.showSwitchUser) out += renderSwitchUserModal();
    if (state.showManageMembers) out += renderManageMembersModal();
    return out;
  }

  function renderAddExpenseModal() {
    var f = state.form;
    var currentGroup = f.groupId ? group(f.groupId) : state.groups[0];
    var groupChoices = state.groups.map(function (g) {
      return '<div class="pill' + (f.groupId === g.id ? ' active' : '') + '" data-action="selectGroupForForm" data-id="' + g.id + '">' + escapeHtml(g.name) + '</div>';
    }).join('');
    var payerChoices = (currentGroup ? currentGroup.memberIds : []).map(function (pid) {
      var p = person(pid);
      return '<div class="pill' + (f.paidBy === pid ? ' active' : '') + '" data-action="selectPayer" data-id="' + pid + '">' + escapeHtml(p.name) + '</div>';
    }).join('');
    var participantRows = (currentGroup ? currentGroup.memberIds : []).map(function (pid) {
      var p = person(pid);
      var included = f.participantIds.indexOf(pid) !== -1;
      var overrideOptions = [{ value: 'self', label: 'paie sa part' }].concat(
        currentGroup.memberIds.filter(function (id2) { return id2 !== pid; }).map(function (id2) { return { value: id2, label: 'pris en charge par ' + person(id2).name }; })
      );
      return (
        '<div class="checkbox-row">' +
        '<div class="checkbox' + (included ? ' checked' : '') + '" data-action="toggleParticipant" data-id="' + pid + '">' + (included ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
        '<div class="col-name">' + escapeHtml(p.name) + (p.isChild ? '<span class="badge-child inline">' + p.childPercent + '%</span>' : '') + '</div>' +
        (included ? '<select class="participant-select" data-bind-change="override" data-id="' + pid + '">' +
          overrideOptions.map(function (opt) { return '<option value="' + opt.value + '"' + ((f.overrides[pid] || 'self') === opt.value ? ' selected' : '') + '>' + escapeHtml(opt.label) + '</option>'; }).join('') +
          '</select>' : '') +
        '</div>'
      );
    }).join('');

    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">' + (f.editingId ? 'modifier la dépense' : 'nouvelle dépense') + '</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="field-label">groupe</div><div class="pill-row">' + groupChoices + '</div>' +
      '<div class="field-label">description</div>' +
      '<input class="text-input" data-bind="expenseLabel" placeholder="courses, essence..." value="' + escapeHtml(f.label) + '" />' +
      '<div class="field-label">montant (' + currencySymbol() + ')</div>' +
      '<input class="text-input" data-bind="expenseAmount" placeholder="0,00" inputmode="decimal" value="' + escapeHtml(f.amount) + '" />' +
      '<div class="checkbox-row" style="border-top:none;margin-bottom:16px" data-action="toggleFullyPaid">' +
      '<div class="checkbox' + (f.fullyPaid ? ' checked' : '') + '">' + (f.fullyPaid ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
      '<div style="font-size:13.5px;color:var(--text-primary);font-weight:600">payée intégralement (pas d\'acompte)</div></div>' +
      (!f.fullyPaid ?
        '<div class="field-label">déjà versé au tiers (' + currencySymbol() + ')</div>' +
        '<input class="text-input" data-bind="paidExternal" placeholder="ex : 500" inputmode="decimal" value="' + escapeHtml(f.paidExternal) + '" />' : '') +
      '<div class="field-label">payé par</div><div class="pill-row">' + payerChoices + '</div>' +
      '<div class="section-label">qui participe ?</div>' + participantRows +
      '<button class="btn-primary pressable" style="margin-top:20px" data-action="submitExpense">' + (f.editingId ? 'enregistrer les modifications' : 'enregistrer la dépense') + '</button>' +
      (state.formError ? '<div class="form-error">' + escapeHtml(state.formError) + '</div>' : '') +
      (f.editingId ? '<button class="delete-link" data-action="deleteExpense">supprimer cette dépense</button>' : '') +
      '</div></div>'
    );
  }

  function renderAddGroupModal() {
    var gf = state.groupForm;
    var choices = state.people.map(function (p) {
      var checked = gf.memberIds.indexOf(p.id) !== -1;
      return '<div class="checkbox-row" data-action="toggleGroupMember" data-id="' + p.id + '">' +
        '<div class="checkbox' + (checked ? ' checked' : '') + '">' + (checked ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
        '<div style="font-size:14px;color:var(--text-primary);font-weight:600">' + escapeHtml(p.name) + '</div></div>';
    }).join('');
    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">nouveau groupe</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="field-label">nom</div>' +
      '<input class="text-input" data-bind="groupName" placeholder="ex : week-end à lyon" value="' + escapeHtml(gf.name) + '" />' +
      '<div class="section-label">membres</div>' + choices +
      '<button class="btn-primary pressable" style="margin-top:20px" data-action="submitGroup">créer le groupe</button>' +
      '</div></div>'
    );
  }

  function renderSettleModal() {
    var sf = state.settleForm;
    var fromName = sf.from ? person(sf.from).name : '';
    var toName = sf.to ? person(sf.to).name : '';
    return (
      '<div class="modal-overlay center" data-action="closeModal">' +
      '<div class="modal-card" data-stop-click>' +
      '<div class="modal-title" style="margin-bottom:14px">enregistrer un paiement</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:14px">' + escapeHtml(fromName) + ' → ' + escapeHtml(toName) + '</div>' +
      '<div class="field-label">montant (' + currencySymbol() + ')</div>' +
      '<input class="text-input" data-bind="settleAmount" inputmode="decimal" value="' + escapeHtml(sf.amount) + '" />' +
      '<div class="modal-footer-buttons">' +
      '<button class="btn-cancel pressable" data-action="closeModal">annuler</button>' +
      '<button class="btn-confirm pressable" data-action="submitSettle">confirmer</button>' +
      '</div></div></div>'
    );
  }

  function renderSwitchUserModal() {
    var adults = state.people.filter(function (p) { return !p.isChild; });
    var rows = adults.map(function (p) {
      var isCurrent = p.id === state.currentUserId;
      return '<button class="switch-user-row pressable" data-action="switchUser" data-id="' + p.id + '" style="background:' + (isCurrent ? 'var(--surface-overlay)' : 'transparent') + '">' +
        '<div class="avatar avatar-38" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
        '<div style="flex:1;font-size:14.5px;font-weight:600;color:var(--text-primary)">' + escapeHtml(p.name) + '</div>' +
        (isCurrent ? '<i class="ph-bold ph-check-circle" style="color:var(--status-positive);font-size:18px"></i>' : '') +
        '</button>';
    }).join('');
    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">se connecter en tant que</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      rows + '</div></div>'
    );
  }

  function renderManageMembersModal() {
    var mg = group(state.manageMembersGroupId);
    if (!mg) return '';
    var rows = state.people.map(function (p) {
      var checked = mg.memberIds.indexOf(p.id) !== -1;
      var isAdmin = p.id === mg.adminId;
      return (
        '<div class="checkbox-row">' +
        '<div class="checkbox' + (checked ? ' checked' : '') + '" data-action="toggleManageMember" data-group-id="' + mg.id + '" data-id="' + p.id + '">' + (checked ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
        '<div style="flex:1;font-size:14px;color:var(--text-primary);font-weight:600">' + escapeHtml(p.name) + (isAdmin ? ' (admin)' : '') + '</div>' +
        (p.isChild ? '<div style="display:flex;align-items:center;gap:4px">' +
          '<input class="child-percent-input" data-bind-change="childPercent" data-id="' + p.id + '" value="' + p.childPercent + '" inputmode="numeric" />' +
          '<span style="font-size:11px;color:var(--text-tertiary)">%</span></div>' : '') +
        '</div>'
      );
    }).join('');
    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">membres · ' + escapeHtml(mg.name) + '</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      rows + '</div></div>'
    );
  }

  function renderToast() {
    return state.toast ? '<div class="toast">' + escapeHtml(state.toast) + '</div>' : '';
  }

  // ---------- Délégation d'événements ----------

  function bindEvents(root) {
    root.onclick = function (e) {
      var stopEl = e.target.closest('[data-stop-click]');
      var overlay = e.target.closest('.modal-overlay');
      if (overlay && !stopEl) { closeModal(); return; }
      if (stopEl && e.target === stopEl) return;

      var el = e.target.closest('[data-action]');
      // Un data-action trouvé en dehors du conteneur de la modale (typiquement
      // l'overlay lui-même) ne doit pas s'appliquer à un clic sur un élément
      // inerte (champ texte, libellé...) à l'intérieur de la modale — sinon
      // ça la referme au moment même où l'utilisateur essaie de taper.
      if (el && stopEl && !stopEl.contains(el)) el = null;
      if (!el) return;
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');
      var groupId = el.getAttribute('data-group-id');
      e.stopPropagation();
      switch (action) {
        case 'goHome': goHome(); break;
        case 'goGroups': goGroups(); break;
        case 'goExpenses': goExpenses(); break;
        case 'goHistory': goHistory(); break;
        case 'goBack': goBack(); break;
        case 'toggleTheme': toggleTheme(); break;
        case 'openPerson': openPerson(id); break;
        case 'openGroup': openGroup(id); break;
        case 'remind': sendReminder(id); break;
        case 'openSwitchUser': openSwitchUser(); break;
        case 'switchUser': switchUser(id); break;
        case 'openAddExpenseGlobal': openAddExpense(state.groups[0] && state.groups[0].id); break;
        case 'openAddExpenseForGroup': openAddExpense(state.selectedGroupId); break;
        case 'openAddGroup': openAddGroup(); break;
        case 'openManageMembers': openManageMembers(id); break;
        case 'deleteGroup': deleteGroup(id); break;
        case 'editExpense': openEditExpense(id); break;
        case 'markPaidFull': markExpensePaidFull(id); break;
        case 'closeModal': closeModal(); break;
        case 'toggleLoginMode': toggleLoginMode(); break;
        case 'submitLogin': submitLogin(); break;
        case 'submitMagicLink': submitMagicLink(); break;
        case 'submitMagicContinue': submitMagicContinue(); break;
        case 'selectGroupForForm': selectGroupForForm(id); break;
        case 'selectPayer': selectPayer(id); break;
        case 'toggleParticipant': toggleParticipant(id); break;
        case 'toggleFullyPaid': toggleFullyPaid(); break;
        case 'submitExpense': submitExpense(); break;
        case 'deleteExpense': deleteExpense(); break;
        case 'toggleGroupMember': toggleGroupMember(id); break;
        case 'submitGroup': submitGroup(); break;
        case 'openSettle': openSettle(id); break;
        case 'submitSettle': submitSettle(); break;
        case 'toggleManageMember': toggleManageMember(groupId, id); break;
        default: break;
      }
    };

    root.oninput = function (e) {
      var el = e.target;
      var bind = el.getAttribute('data-bind');
      if (!bind) return;
      var v = el.value;
      switch (bind) {
        case 'loginEmail': setLoginEmail(v); break;
        case 'loginPassword': setLoginPassword(v); break;
        case 'expenseLabel': setLabel(v); break;
        case 'expenseAmount': setAmount(v); break;
        case 'paidExternal': setPaidExternal(v); break;
        case 'groupName': setGroupName(v); break;
        case 'settleAmount': setSettleAmount(v); break;
        default: break;
      }
    };

    root.onchange = function (e) {
      var el = e.target;
      var bind = el.getAttribute('data-bind-change');
      if (!bind) return;
      var id = el.getAttribute('data-id');
      switch (bind) {
        case 'override': setOverride(id, el.value); break;
        case 'childPercent': setChildPercent(id, el.value); break;
        default: break;
      }
    };
  }

  document.addEventListener('DOMContentLoaded', render);
}());
