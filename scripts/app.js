/**
 * kotikota — application de suivi des dépenses entre amis.
 * Port fidèle de l'UI et des interactions du prototype de design
 * (design_handoff_expense_tracker/Depenses App.dc.html) en HTML/CSS/JS
 * vanilla. Le moteur de calcul est isolé dans scripts/calc.js (testé
 * séparément, cf. tests/calc.test.js).
 *
 * Backend : Supabase (auth réelle, Postgres, invitations par e-mail — cf.
 * supabase/). `scripts/supabase-client.js` expose `window.supabaseClient`.
 */
(function () {
  'use strict';

  var calc = window.KotikotaCalc;
  var seed = window.KotikotaData;
  var sb = window.supabaseClient;
  var THEME_KEY = 'kotikota-theme';

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (err) { return 'light'; }
  }
  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* mode privé / quota */ }
  }

  function defaultState() {
    return {
      screen: 'home',
      navStack: [],
      theme: loadTheme(),
      loggedIn: false,
      dataLoading: false,
      loginMode: 'password',
      loginForm: { email: '', password: '', name: '' },
      loginError: null,
      magicSent: false,
      resetSent: false,
      passwordRecovery: false,
      newPasswordForm: { password: '' },
      currentUserId: null,
      showAccount: false,
      showManageMembers: false,
      manageMembersGroupId: null,
      showConfirmDeleteGroup: false,
      confirmDeleteGroupId: null,
      showConfirmRemoveMember: false,
      confirmRemoveMemberGroupId: null,
      confirmRemoveMemberId: null,
      showConfirmLeaveGroup: false,
      confirmLeaveGroupId: null,
      selectedGroupId: null,
      selectedPersonId: null,
      equilibrerMode: 'foyer',
      homeGroupFilter: null,
      expensesGroupFilter: null,
      personGroupFilter: null,
      settleGroupId: null,
      people: [],
      groups: [],
      expenses: [],
      payments: [],
      reminders: [],
      toast: null,
      showAddExpense: false,
      showAddGroup: false,
      showSettle: false,
      showAddMemberForm: false,
      addingMember: false,
      households: [],
      newHouseholdName: '',
      addMemberForm: { name: '', email: '', shareWeight: '1', guardianId: null },
      form: { label: '', amount: '', groupId: null, paidBy: null, participantIds: [], overrides: {}, category: 'autre' },
      expensesSearchQuery: '',
      lastActiveGroupId: null,
      groupForm: { name: '', currency: seed.CURRENCIES[0].code, invitees: [{ name: '', email: '', shareWeight: '1' }] },
      submittingGroup: false,
      settleForm: { from: null, to: null, amount: '' },
      formError: null,
    };
  }

  var state = defaultState();
  var toastTimer = null;

  function setState(patch) {
    var partial = typeof patch === 'function' ? patch(state) : patch;
    state = Object.assign({}, state, partial);
    render();
  }

  // Comme setState, mais sans re-rendu : pour les champs texte, où rien
  // d'autre à l'écran ne dépend de la valeur frappe par frappe. Reconstruire
  // tout le DOM à chaque caractère saisi provoquait un flash visuel (la
  // transition CSS globale rejoue sur les nœuds recréés) et perturbait le
  // clavier virtuel sur mobile.
  function setStateSilent(patch) {
    var partial = typeof patch === 'function' ? patch(state) : patch;
    state = Object.assign({}, state, partial);
  }

  // ---------- Helpers métier (portés du prototype) ----------

  function person(id) { return calc.findPerson(state.people, id); }
  function group(id) { return state.groups.find(function (g) { return g.id === id; }); }
  // Devise par défaut utilisée pour les agrégats qui traversent plusieurs
  // groupes (accueil, toutes les dépenses, historique) : on considère qu'un
  // même compte n'utilise en pratique qu'une seule devise à la fois (cf.
  // README) — ces vues agrégées ne s'affichent d'ailleurs que si tous les
  // groupes du compte partagent la même devise (cf. groupsHaveSingleCurrency),
  // donc celle du premier groupe. Chaque groupe garde sa propre devise pour
  // son propre affichage. '€' ne sert que si le compte n'a encore aucun
  // groupe (aucun montant à afficher de toute façon).
  function defaultCurrency() { return state.groups.length ? state.groups[0].currency : null; }
  function currencyMeta(code) {
    var resolved = code || defaultCurrency();
    return seed.CURRENCIES.find(function (c) { return c.code === resolved; }) || null;
  }
  function currencySymbolFor(code) {
    var m = currencyMeta(code);
    return m ? m.symbol : '€';
  }
  function currencyDecimalsFor(code) {
    var m = currencyMeta(code);
    return m ? m.decimals : 2;
  }
  function fmt(n) { return fmtIn(n, null); }
  // Sépare les milliers (espace, convention française) et n'affiche des
  // décimales que si la devise les utilise couramment au quotidien (la
  // plupart des francs africains n'en ont pas, cf. scripts/data.js).
  function fmtIn(n, currencyCode) {
    var decimals = currencyDecimalsFor(currencyCode);
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return sign + v + ' ' + currencySymbolFor(currencyCode);
  }
  function initials(name) { return name.slice(0, 2).toUpperCase(); }
  function colorForBalance(n) { return calc.colorForBalance(n); }
  function hasCustomWeight(p) { return p.shareWeight != null && Math.abs(p.shareWeight - 1) > 0.001; }
  function shareBadge(p, inline) {
    if (!hasCustomWeight(p)) return '';
    return '<span class="badge-child' + (inline ? ' inline' : '') + '">coef. ' + String(p.shareWeight).replace('.', ',') + '</span>';
  }

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
    // Les messages d'erreur restent affichés plus longtemps : un toast de
    // 2,6s qui disparaît tout seul est facile à manquer, notamment pour un
    // échec d'invitation qu'on ne remarque qu'en constatant après coup
    // qu'un membre n'a pas été ajouté.
    var duration = /^erreur/i.test(msg) ? 6500 : 2600;
    toastTimer = setTimeout(function () {
      setState(function (s) { return s.toast === msg ? { toast: null } : {}; });
    }, duration);
  }

  function firstErrorOf(results) {
    for (var i = 0; i < results.length; i++) {
      if (results[i].error) return results[i].error;
    }
    return null;
  }

  // ---------- Chargement des données (Supabase) ----------

  function loadAppData() {
    setStateSilent({ dataLoading: true });
    render();
    return Promise.all([
      sb.from('profiles').select('*'),
      sb.from('groups').select('*'),
      sb.from('group_members').select('*'),
      sb.from('expenses').select('*'),
      sb.from('expense_participants').select('*'),
      sb.from('payments').select('*'),
      sb.from('reminders').select('*'),
      sb.from('households').select('*'),
    ]).then(function (results) {
      var err = firstErrorOf(results);
      if (err) throw err;
      var profileRows = results[0].data, groupRows = results[1].data, memberRows = results[2].data,
        expenseRows = results[3].data, participantRows = results[4].data, paymentRows = results[5].data,
        reminderRows = results[6].data, householdRows = results[7].data;

      var people = profileRows.map(function (p) {
        return {
          id: p.id, name: p.name, color: p.color, shareWeight: p.share_weight,
          guardianId: p.guardian_id || undefined,
          householdId: p.household_id || undefined,
        };
      });
      var households = householdRows.map(function (h) {
        return { id: h.id, name: h.name, color: h.color, createdBy: h.created_by, groupId: h.group_id };
      });
      var groups = groupRows.map(function (g) {
        return {
          id: g.id, name: g.name, icon: g.icon, currency: g.currency, adminId: g.admin_id,
          memberIds: memberRows.filter(function (m) { return m.group_id === g.id; }).map(function (m) { return m.user_id; }),
        };
      });
      var expenses = expenseRows.map(function (e) {
        var parts = participantRows.filter(function (p) { return p.expense_id === e.id; });
        var overrides = {};
        parts.forEach(function (p) { if (p.override_responsible_id) overrides[p.user_id] = p.override_responsible_id; });
        return {
          id: e.id, groupId: e.group_id, label: e.label, icon: e.icon, amount: Number(e.amount),
          paidExternal: e.paid_external != null ? Number(e.paid_external) : null,
          paidBy: e.paid_by, date: e.expense_date, participants: parts.map(function (p) { return p.user_id; }), overrides: overrides,
          receiptPath: e.receipt_path || null,
        };
      });
      var payments = paymentRows.map(function (p) {
        return { id: p.id, from: p.from_user, to: p.to_user, amount: Number(p.amount), date: p.payment_date, groupId: p.group_id };
      });
      var reminders = reminderRows.map(function (r) {
        return { id: r.id, toPersonId: r.to_user, amount: Number(r.amount), date: r.reminder_date, message: r.message };
      });

      setState({ people: people, groups: groups, expenses: expenses, payments: payments, reminders: reminders, households: households, dataLoading: false });
    }).catch(function (err) {
      setState({ dataLoading: false });
      showToast('erreur de chargement : ' + (err && err.message ? err.message : 'inconnue'));
    });
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
  function openGroup(id) { navigate('groupDetail', { selectedGroupId: id, lastActiveGroupId: id }); }
  function openPerson(id) { navigate('person', { selectedPersonId: id, personGroupFilter: state.homeGroupFilter }); }
  function setHomeGroupFilter(id) { setState({ homeGroupFilter: id || null }); }
  function setExpensesGroupFilter(id) { setState({ expensesGroupFilter: id || null }); }
  function setExpensesSearch(v) { setState({ expensesSearchQuery: v }); }
  function setPersonGroupFilter(id) { setState({ personGroupFilter: id || null }); }
  function toggleTheme() {
    setState(function (s) {
      var next = s.theme === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return { theme: next };
    });
  }

  // ---------- Auth ----------
  function toggleLoginMode() { setState(function (s) { return { loginMode: s.loginMode === 'password' ? 'magic' : 'password', loginError: null, magicSent: false }; }); }
  function showSignup() { setState({ loginMode: 'signup', loginError: null }); }
  function showPasswordLogin() { setState({ loginMode: 'password', loginError: null }); }
  function showForgotPassword() { setState({ loginMode: 'forgotPassword', loginError: null, resetSent: false }); }
  function backToLoginForm() { setState({ magicSent: false, loginError: null }); }
  function setLoginEmail(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { email: v }), loginError: null }; }); }
  function setLoginPassword(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { password: v }), loginError: null }; }); }
  function setLoginName(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { name: v }), loginError: null }; }); }
  function setNewPassword(v) { setStateSilent(function (s) { return { newPasswordForm: Object.assign({}, s.newPasswordForm, { password: v }), loginError: null }; }); }

  function submitLogin() {
    var f = state.loginForm;
    if (!f.email.trim() || f.email.indexOf('@') === -1) { setState({ loginError: 'entre un e-mail valide.' }); return; }
    if (!f.password || f.password.length < 4) { setState({ loginError: 'mot de passe trop court.' }); return; }
    setState({ loginError: null });
    sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password }).then(function (res) {
      if (res.error) setState({ loginError: 'e-mail ou mot de passe incorrect.' });
      // sinon : onAuthStateChange prend le relais (connexion + chargement des données).
    });
  }

  function submitSignup() {
    var f = state.loginForm;
    if (!f.name.trim()) { setState({ loginError: 'entre ton prénom.' }); return; }
    if (!f.email.trim() || f.email.indexOf('@') === -1) { setState({ loginError: 'entre un e-mail valide.' }); return; }
    if (!f.password || f.password.length < 6) { setState({ loginError: 'mot de passe trop court (6 caractères min).' }); return; }
    setState({ loginError: null });
    sb.auth.signUp({
      email: f.email.trim(), password: f.password,
      options: { data: { name: f.name.trim(), color: '#7C5CFF' } },
    }).then(function (res) {
      if (res.error) { setState({ loginError: res.error.message }); return; }
      if (!res.data.session) {
        setState({ loginMode: 'password', loginForm: { email: '', password: '', name: '' } });
        showToast('compte créé — vérifie ta boîte mail pour confirmer avant de te connecter.');
      }
      // sinon (confirmation e-mail désactivée) : onAuthStateChange connecte directement.
    });
  }

  function submitMagicLink() {
    var f = state.loginForm;
    if (!f.email.trim() || f.email.indexOf('@') === -1) { setState({ loginError: 'entre un e-mail valide.' }); return; }
    setState({ loginError: null });
    sb.auth.signInWithOtp({
      email: f.email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    }).then(function (res) {
      if (res.error) { setState({ loginError: res.error.message }); return; }
      setState({ magicSent: true });
    });
  }

  function submitForgotPassword() {
    var f = state.loginForm;
    if (!f.email.trim() || f.email.indexOf('@') === -1) { setState({ loginError: 'entre un e-mail valide.' }); return; }
    setState({ loginError: null });
    sb.auth.resetPasswordForEmail(f.email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    }).then(function (res) {
      if (res.error) { setState({ loginError: res.error.message }); return; }
      setState({ resetSent: true });
    });
  }

  function submitNewPassword() {
    var pw = state.newPasswordForm.password;
    if (!pw || pw.length < 6) { setState({ loginError: 'mot de passe trop court (6 caractères min).' }); return; }
    setState({ loginError: null });
    sb.auth.updateUser({ password: pw }).then(function (res) {
      if (res.error) { setState({ loginError: res.error.message }); return; }
      setState({ passwordRecovery: false, newPasswordForm: { password: '' } });
      showToast('mot de passe mis à jour');
      if (res.data && res.data.user) {
        setStateSilent({ loggedIn: true, currentUserId: res.data.user.id, dataLoading: true });
        render();
        loadAppData();
      }
    });
  }

  function logout() {
    setState({ showAccount: false });
    sb.auth.signOut();
    // onAuthStateChange (SIGNED_OUT) réinitialise l'état et affiche l'écran de connexion.
  }

  // ---------- Reminders / settle ----------
  // groupId (optionnel) doit correspondre au filtre actif sur l'écran d'où
  // l'action est déclenchée, pour que le montant proposé corresponde à ce
  // qui est affiché à l'écran plutôt qu'au solde tous groupes confondus.
  function sendReminder(personId, groupId) {
    var p = person(personId);
    var g = groupId ? group(groupId) : null;
    var debts = groupId ? computeDebtsForGroup(groupId) : computeDebts();
    var rel = pairNet(state.currentUserId, personId, debts);
    var amt = rel > 0 ? rel : 0;
    var msg = 'petit rappel à ' + p.name + ' — psst, tu me dois encore ' + (g ? fmtIn(amt, g.currency) : fmt(amt));
    sb.from('reminders').insert({ from_user: state.currentUserId, to_user: personId, amount: amt, message: msg }).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData().then(function () { showToast('rappel envoyé à ' + p.name); });
    });
  }
  function openSettle(personId, groupId) {
    var me = state.currentUserId;
    var debts = groupId ? computeDebtsForGroup(groupId) : computeDebts();
    var bal = pairNet(me, personId, debts);
    var from = bal < 0 ? personId : me;
    var to = bal < 0 ? me : personId;
    var decimals = currencyDecimalsFor(groupId && group(groupId) ? group(groupId).currency : null);
    setState({ showSettle: true, settleGroupId: groupId || null, settleForm: { from: from, to: to, amount: Math.abs(bal).toFixed(decimals).replace('.', ',') } });
  }
  function setSettleAmount(v) { setStateSilent(function (s) { return { settleForm: Object.assign({}, s.settleForm, { amount: v }) }; }); }
  function submitSettle() {
    var sf = state.settleForm;
    var amt = parseFloat((sf.amount || '').replace(',', '.'));
    if (!amt || amt <= 0) return;
    sb.from('payments').insert({ from_user: sf.from, to_user: sf.to, amount: amt, group_id: state.settleGroupId || null }).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ showSettle: false, settleGroupId: null });
      loadAppData().then(function () { showToast('paiement enregistré'); });
    });
  }

  // ---------- Expenses ----------
  function openAddExpense(groupId) {
    var g = groupId ? group(groupId) : state.groups[0];
    if (!g) { showToast('crée d\'abord un groupe pour ajouter une dépense'); return; }
    var overrides = {};
    g.memberIds.forEach(function (pid) { if (person(pid).guardianId) overrides[pid] = person(pid).guardianId; });
    setState({
      showAddExpense: true,
      formError: null,
      form: {
        editingId: null, label: '', amount: '', date: new Date().toISOString().slice(0, 10), groupId: g.id, paidBy: state.currentUserId,
        participantIds: g.memberIds.slice(), overrides: overrides, fullyPaid: true, paidExternal: '', category: 'autre',
        receiptPath: null, receiptFile: null, receiptRemove: false,
      },
    });
  }
  function categoryForIcon(icon) {
    var found = seed.EXPENSE_CATEGORIES.find(function (c) { return c.icon === icon; });
    return found ? found.id : 'autre';
  }
  function iconForCategory(categoryId) {
    var found = seed.EXPENSE_CATEGORIES.find(function (c) { return c.id === categoryId; });
    return found ? found.icon : seed.EXPENSE_CATEGORIES[seed.EXPENSE_CATEGORIES.length - 1].icon;
  }
  function openEditExpense(expenseId) {
    var e = state.expenses.find(function (x) { return x.id === expenseId; });
    if (!e) return;
    var fullyPaid = (e.paidExternal != null ? e.paidExternal : e.amount) >= e.amount - 0.005;
    setState({
      showAddExpense: true,
      formError: null,
      form: {
        editingId: e.id, label: e.label, amount: String(e.amount).replace('.', ','), date: e.date, groupId: e.groupId, paidBy: e.paidBy,
        participantIds: e.participants.slice(), overrides: Object.assign({}, e.overrides || {}),
        fullyPaid: fullyPaid, paidExternal: fullyPaid ? '' : String(e.paidExternal != null ? e.paidExternal : 0).replace('.', ','),
        category: categoryForIcon(e.icon),
        receiptPath: e.receiptPath || null, receiptFile: null, receiptRemove: false,
      },
    });
  }
  function deleteExpense() {
    var id = state.form.editingId;
    if (!id) return;
    sb.from('expenses').delete().eq('id', id).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ showAddExpense: false });
      loadAppData().then(function () { showToast('dépense supprimée'); });
    });
  }
  function markExpensePaidFull(expenseId) {
    var e = state.expenses.find(function (x) { return x.id === expenseId; });
    if (!e) return;
    sb.from('expenses').update({ paid_external: e.amount }).eq('id', expenseId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData().then(function () { showToast('marqué comme réglé en totalité'); });
    });
  }
  function toggleFullyPaid() { setState(function (s) { return { form: Object.assign({}, s.form, { fullyPaid: !s.form.fullyPaid }) }; }); }
  function setPaidExternal(v) { setStateSilent(function (s) { return { form: Object.assign({}, s.form, { paidExternal: v }) }; }); }
  function setLabel(v) { setStateSilent(function (s) { return { form: Object.assign({}, s.form, { label: v }) }; }); }
  function setAmount(v) { setStateSilent(function (s) { return { form: Object.assign({}, s.form, { amount: v }) }; }); }
  function setDate(v) { setStateSilent(function (s) { return { form: Object.assign({}, s.form, { date: v }) }; }); }
  function setCategory(categoryId) { setState(function (s) { return { form: Object.assign({}, s.form, { category: categoryId }) }; }); }
  function selectGroupForForm(groupId) {
    var g = group(groupId);
    var overrides = {};
    g.memberIds.forEach(function (pid) { if (person(pid).guardianId) overrides[pid] = person(pid).guardianId; });
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
  function setReceiptFile(file) {
    setState(function (s) { return { form: Object.assign({}, s.form, { receiptFile: file, receiptRemove: false }) }; });
  }
  function removeReceipt() {
    setState(function (s) { return { form: Object.assign({}, s.form, { receiptFile: null, receiptRemove: true }) }; });
  }
  function viewReceipt(path) {
    sb.storage.from('receipts').createSignedUrl(path, 120).then(function (res) {
      if (res.error || !res.data) { showToast('impossible d\'ouvrir le reçu'); return; }
      window.open(res.data.signedUrl, '_blank', 'noopener');
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
  function sanitizeFilename(name) {
    return String(name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // Dépose/retire le reçu joint après coup (a besoin de l'id de la dépense,
  // donc appelé une fois l'INSERT/UPDATE de la dépense elle-même terminé).
  // Chaque envoi utilise un nom de fichier unique (horodaté) : pas besoin de
  // policy d'update sur storage.objects, l'ancien fichier est juste retiré
  // une fois le nouveau chemin enregistré.
  function persistReceiptChange(expenseId, groupId) {
    var f = state.form;
    if (f.receiptFile) {
      var oldPath = f.receiptPath;
      var path = groupId + '/' + expenseId + '-' + Date.now() + '-' + sanitizeFilename(f.receiptFile.name);
      return sb.storage.from('receipts').upload(path, f.receiptFile).then(function (upRes) {
        if (upRes.error) return { error: upRes.error };
        return sb.from('expenses').update({ receipt_path: path }).eq('id', expenseId).then(function (res) {
          if (res.error) return { error: res.error };
          if (oldPath) sb.storage.from('receipts').remove([oldPath]);
          return { error: null };
        });
      });
    }
    if (f.receiptRemove && f.receiptPath) {
      return sb.from('expenses').update({ receipt_path: null }).eq('id', expenseId).then(function (res) {
        if (res.error) return { error: res.error };
        sb.storage.from('receipts').remove([f.receiptPath]);
        return { error: null };
      });
    }
    return Promise.resolve({ error: null });
  }

  function submitExpense() {
    var f = state.form;
    var amt = parseFloat((f.amount || '').replace(',', '.'));
    if (!f.label.trim()) { setState({ formError: 'ajoute une description.' }); return; }
    if (!amt || amt <= 0) { setState({ formError: 'montant invalide.' }); return; }
    if (!f.date) { setState({ formError: 'choisis une date.' }); return; }
    if (f.participantIds.length === 0) { setState({ formError: 'sélectionne au moins un participant.' }); return; }
    var g = group(f.groupId);
    var paidExternal = amt;
    if (!f.fullyPaid) {
      var pe = parseFloat((f.paidExternal || '').replace(',', '.'));
      paidExternal = isNaN(pe) ? 0 : Math.max(0, Math.min(amt, pe));
    }
    setState({ formError: null });

    var participantRowsFor = function (expenseId) {
      return f.participantIds.map(function (pid) { return { expense_id: expenseId, user_id: pid, override_responsible_id: f.overrides[pid] || null }; });
    };

    if (f.editingId) {
      sb.from('expenses').update({
        group_id: f.groupId, label: f.label.trim(), icon: iconForCategory(f.category), amount: amt, paid_external: paidExternal, expense_date: f.date, paid_by: f.paidBy,
      }).eq('id', f.editingId).then(function (res) {
        if (res.error) { setState({ formError: res.error.message }); return; }
        sb.from('expense_participants').delete().eq('expense_id', f.editingId).then(function () {
          sb.from('expense_participants').insert(participantRowsFor(f.editingId)).then(function (insRes) {
            if (insRes.error) { showToast('erreur : ' + insRes.error.message); return; }
            persistReceiptChange(f.editingId, f.groupId).then(function (recRes) {
              setState({ showAddExpense: false });
              loadAppData().then(function () {
                showToast(recRes.error ? 'dépense modifiée (reçu : ' + recRes.error.message + ')' : 'dépense modifiée');
              });
            });
          });
        });
      });
      return;
    }

    sb.from('expenses').insert({
      group_id: f.groupId, label: f.label.trim(), icon: iconForCategory(f.category), amount: amt, paid_external: paidExternal, paid_by: f.paidBy, expense_date: f.date,
    }).select().single().then(function (res) {
      if (res.error) { setState({ formError: res.error.message }); return; }
      sb.from('expense_participants').insert(participantRowsFor(res.data.id)).then(function (insRes) {
        if (insRes.error) { showToast('erreur : ' + insRes.error.message); return; }
        persistReceiptChange(res.data.id, f.groupId).then(function (recRes) {
          setState({ showAddExpense: false });
          loadAppData().then(function () {
            showToast(recRes.error ? 'dépense ajoutée à ' + g.name + ' (reçu : ' + recRes.error.message + ')' : 'dépense ajoutée à ' + g.name);
          });
        });
      });
    });
  }

  // ---------- Groups ----------
  var INVITEE_COLORS = ['#4ADE80', '#F97362', '#9B81FF', '#29B876', '#F4D35E', '#5B9CF6', '#E88AC4'];

  function openAddGroup() {
    setState({
      showAddGroup: true,
      formError: null,
      submittingGroup: false,
      groupForm: { name: '', currency: seed.CURRENCIES[0].code, invitees: [{ name: '', email: '', shareWeight: '1' }] },
    });
  }
  function setGroupName(v) { setStateSilent(function (s) { return { groupForm: Object.assign({}, s.groupForm, { name: v }) }; }); }
  function setGroupCurrency(code) { setState(function (s) { return { groupForm: Object.assign({}, s.groupForm, { currency: code }) }; }); }
  function updateInvitee(index, field, value, silent) {
    var fn = silent ? setStateSilent : setState;
    fn(function (s) {
      var invitees = s.groupForm.invitees.map(function (inv, i) {
        return i === index ? Object.assign({}, inv, (function () { var patch = {}; patch[field] = value; return patch; })()) : inv;
      });
      return { groupForm: Object.assign({}, s.groupForm, { invitees: invitees }) };
    });
  }
  function setInviteeName(index, v) { updateInvitee(index, 'name', v, true); }
  function setInviteeEmail(index, v) { updateInvitee(index, 'email', v, true); }
  function setInviteeShare(index, v) { updateInvitee(index, 'shareWeight', v, true); }
  function addInviteeRow() {
    setState(function (s) { return { groupForm: Object.assign({}, s.groupForm, { invitees: s.groupForm.invitees.concat([{ name: '', email: '', shareWeight: '1' }]) }) }; });
  }
  function removeInviteeRow(index) {
    setState(function (s) {
      var invitees = s.groupForm.invitees.filter(function (_, i) { return i !== index; });
      if (invitees.length === 0) invitees = [{ name: '', email: '', shareWeight: '1' }];
      return { groupForm: Object.assign({}, s.groupForm, { invitees: invitees }) };
    });
  }
  // Invite un membre par e-mail dans un groupe déjà créé. Retourne une
  // promesse résolue avec null en cas de succès, ou une chaîne décrivant
  // l'échec sinon — jamais rejetée, pour pouvoir enchaîner les invitations
  // d'une série les unes après les autres sans qu'un échec en bloque
  // d'autres.
  // Résout toujours { ok, userId, failure } — jamais rejeté — pour pouvoir
  // enchaîner plusieurs invitations sans qu'un échec en bloque d'autres.
  function inviteMemberToGroup(groupId, name, email, shareWeight, color) {
    return sb.functions.invoke('invite-member', {
      body: { groupId: groupId, name: name, email: email, shareWeight: shareWeight, color: color },
    }).then(function (inviteRes) {
      if (!inviteRes.error && !(inviteRes.data && inviteRes.data.error)) {
        return { ok: true, userId: inviteRes.data && inviteRes.data.userId, failure: null };
      }
      if (inviteRes.data && inviteRes.data.error) return { ok: false, userId: null, failure: name + ' (' + inviteRes.data.error + ')' };
      // Quand la fonction répond avec un statut non-2xx, supabase-js met un
      // message générique ("Edge Function returned a non-2xx status code")
      // dans error.message — le vrai message renvoyé par invite-member (ex :
      // "seul l'admin peut inviter", "e-mail invalide"...) est dans le corps
      // JSON de la réponse, accessible via error.context.
      var ctx = inviteRes.error && inviteRes.error.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (body) {
          return { ok: false, userId: null, failure: name + ' (' + (body && body.error ? body.error : inviteRes.error.message) + ')' };
        }).catch(function () {
          return { ok: false, userId: null, failure: name + ' (' + inviteRes.error.message + ')' };
        });
      }
      return { ok: false, userId: null, failure: name + ' (' + (inviteRes.error ? inviteRes.error.message : 'erreur inconnue') + ')' };
    }).catch(function (err) {
      return { ok: false, userId: null, failure: name + ' (' + (err && err.message ? err.message : 'erreur réseau') + ')' };
    });
  }

  // Enchaîne les invitations une par une (plutôt qu'en parallèle) : plus
  // simple à diagnostiquer en cas d'échec, et évite de solliciter l'API
  // d'invitation de Supabase avec plusieurs appels concurrents d'un coup.
  function inviteSequentially(invitees, groupId) {
    var failed = [];
    return invitees.reduce(function (chain, invitee, idx) {
      return chain.then(function () {
        return inviteMemberToGroup(groupId, invitee.name.trim(), invitee.email.trim(), invitee.shareWeight, INVITEE_COLORS[idx % INVITEE_COLORS.length])
          .then(function (result) { if (!result.ok) failed.push(result.failure); });
      });
    }, Promise.resolve()).then(function () { return failed; });
  }

  function submitGroup() {
    if (state.submittingGroup) return;
    var gf = state.groupForm;
    if (!gf.name.trim()) { setState({ formError: 'donne un nom au groupe.' }); return; }
    var validInvitees = gf.invitees.filter(function (inv) { return inv.name.trim() || inv.email.trim(); });
    for (var i = 0; i < validInvitees.length; i++) {
      var inv = validInvitees[i];
      if (!inv.name.trim()) { setState({ formError: 'donne un prénom à chaque membre invité.' }); return; }
      if (!inv.email.trim() || inv.email.indexOf('@') === -1) { setState({ formError: 'entre un e-mail valide pour ' + inv.name.trim() + '.' }); return; }
    }
    setState({ formError: null, submittingGroup: true });

    sb.from('groups').insert({ name: gf.name.trim(), currency: gf.currency, admin_id: state.currentUserId }).select().single().then(function (res) {
      if (res.error) { setState({ formError: res.error.message, submittingGroup: false }); return; }
      var newGroup = res.data;
      sb.from('group_members').insert({ group_id: newGroup.id, user_id: state.currentUserId }).then(function (memRes) {
        if (memRes.error) { setState({ formError: memRes.error.message, submittingGroup: false }); return; }

        inviteSequentially(validInvitees, newGroup.id).then(function (failedInvites) {
          setState({ showAddGroup: false, submittingGroup: false, lastActiveGroupId: newGroup.id });
          loadAppData().then(function () {
            if (failedInvites.length) showToast('erreur : invitation impossible pour ' + failedInvites.join(', ') + ' — réessaie depuis "gérer les membres".');
            else showToast(validInvitees.length ? 'groupe créé, invitations envoyées par e-mail' : 'groupe créé');
          });
        });
      });
    });
  }
  function openConfirmDeleteGroup(groupId) { setState({ showConfirmDeleteGroup: true, confirmDeleteGroupId: groupId }); }
  function confirmDeleteGroup() {
    var groupId = state.confirmDeleteGroupId;
    if (!groupId) return;
    sb.from('groups').delete().eq('id', groupId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ screen: 'groups', navStack: [], showConfirmDeleteGroup: false, confirmDeleteGroupId: null });
      loadAppData().then(function () { showToast('groupe supprimé'); });
    });
  }
  function openManageMembers(groupId) { setState({ showManageMembers: true, manageMembersGroupId: groupId }); }
  function toggleAddMemberForm() {
    setState(function (s) {
      return {
        showAddMemberForm: !s.showAddMemberForm,
        formError: null,
        addMemberForm: { name: '', email: '', shareWeight: '1', guardianId: null },
      };
    });
  }
  function setAddMemberName(v) { setStateSilent(function (s) { return { addMemberForm: Object.assign({}, s.addMemberForm, { name: v }) }; }); }
  function setAddMemberEmail(v) { setStateSilent(function (s) { return { addMemberForm: Object.assign({}, s.addMemberForm, { email: v }) }; }); }
  function setAddMemberWeight(v) { setStateSilent(function (s) { return { addMemberForm: Object.assign({}, s.addMemberForm, { shareWeight: v }) }; }); }
  function setAddMemberGuardian(v) { setState(function (s) { return { addMemberForm: Object.assign({}, s.addMemberForm, { guardianId: v || null }) }; }); }
  // L'e-mail est facultatif : renseigné, il déclenche un vrai e-mail
  // d'invitation (compte réel créé pour cette personne) ; laissé vide, on
  // crée juste un profil sans compte, ajouté directement au groupe (utile
  // pour quelqu'un qui ne se connectera jamais à l'app, avec ou sans
  // responsable qui couvre ses dépenses).
  function submitAddMember() {
    if (state.addingMember) return;
    var f = state.addMemberForm;
    var groupId = state.manageMembersGroupId;
    if (!f.name.trim()) { setState({ formError: 'donne un prénom.' }); return; }
    if (f.email.trim() && f.email.indexOf('@') === -1) { setState({ formError: 'e-mail invalide.' }); return; }
    var w = parseFloat((f.shareWeight || '1').replace(',', '.'));
    if (isNaN(w) || w < 0) { setState({ formError: 'nombre de parts invalide.' }); return; }
    setState({ formError: null });

    function finish(msg) {
      setState({ showAddMemberForm: false, addMemberForm: { name: '', email: '', shareWeight: '1', guardianId: null } });
      loadAppData().then(function () { showToast(msg); });
    }

    if (f.email.trim()) {
      setState({ addingMember: true });
      var color = INVITEE_COLORS[state.people.length % INVITEE_COLORS.length];
      inviteMemberToGroup(groupId, f.name.trim(), f.email.trim(), f.shareWeight, color).then(function (result) {
        setState({ addingMember: false });
        if (!result.ok) { setState({ formError: 'invitation impossible : ' + result.failure }); return; }
        if (f.guardianId && result.userId) {
          sb.from('profiles').update({ guardian_id: f.guardianId }).eq('id', result.userId).then(function () {
            finish('invitation envoyée par e-mail');
          });
        } else {
          finish('invitation envoyée par e-mail');
        }
      });
      return;
    }

    sb.from('profiles').insert({
      name: f.name.trim(), color: INVITEE_COLORS[state.people.length % INVITEE_COLORS.length],
      share_weight: w, guardian_id: f.guardianId || null, created_by: state.currentUserId,
    }).select().single().then(function (res) {
      if (res.error) { setState({ formError: res.error.message }); return; }
      sb.from('group_members').insert({ group_id: groupId, user_id: res.data.id }).then(function (memRes) {
        if (memRes.error) { showToast('erreur : ' + memRes.error.message); return; }
        finish('membre ajouté');
      });
    });
  }
  function openConfirmRemoveMember(groupId, personId) {
    var g = group(groupId);
    if (!g || personId === g.adminId) return;
    setState({ showConfirmRemoveMember: true, confirmRemoveMemberGroupId: groupId, confirmRemoveMemberId: personId });
  }
  function cancelRemoveMember() { setState({ showConfirmRemoveMember: false, confirmRemoveMemberGroupId: null, confirmRemoveMemberId: null }); }
  function confirmRemoveMember() {
    var groupId = state.confirmRemoveMemberGroupId;
    var personId = state.confirmRemoveMemberId;
    if (!groupId || !personId) return;
    sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', personId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ showConfirmRemoveMember: false, confirmRemoveMemberGroupId: null, confirmRemoveMemberId: null });
      loadAppData().then(function () { showToast('membre retiré du groupe'); });
    });
  }
  function openConfirmLeaveGroup(groupId) {
    var g = group(groupId);
    if (!g || g.adminId === state.currentUserId) return;
    setState({ showConfirmLeaveGroup: true, confirmLeaveGroupId: groupId });
  }
  function cancelLeaveGroup() { setState({ showConfirmLeaveGroup: false, confirmLeaveGroupId: null }); }
  function confirmLeaveGroup() {
    var groupId = state.confirmLeaveGroupId;
    if (!groupId) return;
    sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', state.currentUserId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ showConfirmLeaveGroup: false, confirmLeaveGroupId: null, screen: 'groups', navStack: [], selectedGroupId: null });
      loadAppData().then(function () { showToast('tu as quitté le groupe'); });
    });
  }
  function setShareWeight(personId, value) {
    var w = parseFloat(String(value).replace(',', '.'));
    if (isNaN(w) || w < 0) return;
    sb.from('profiles').update({ share_weight: w }).eq('id', personId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData();
    });
  }
  function setGuardian(personId, guardianId) {
    if (guardianId === personId) return;
    sb.from('profiles').update({ guardian_id: guardianId || null }).eq('id', personId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData();
    });
  }
  function setMemberHousehold(personId, householdId) {
    sb.from('profiles').update({ household_id: householdId || null }).eq('id', personId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData();
    });
  }
  function setNewHouseholdName(v) { setStateSilent({ newHouseholdName: v }); }
  function createHousehold() {
    var name = (state.newHouseholdName || '').trim();
    if (!name) return;
    sb.from('households').insert({ name: name, created_by: state.currentUserId, group_id: state.manageMembersGroupId }).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ newHouseholdName: '' });
      loadAppData().then(function () { showToast('foyer créé'); });
    });
  }

  // ---------- Modales ----------
  function openAccount() { setState({ showAccount: true }); }
  function closeModal() {
    lastModalScrollTop = null;
    setState({
      showAddExpense: false, showAddGroup: false, showSettle: false, showAccount: false, showManageMembers: false,
      showConfirmDeleteGroup: false, confirmDeleteGroupId: null, formError: null,
      showConfirmRemoveMember: false, confirmRemoveMemberGroupId: null, confirmRemoveMemberId: null,
      showConfirmLeaveGroup: false, confirmLeaveGroupId: null,
      settleGroupId: null, showAddMemberForm: false,
    });
  }

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

  // Persiste au-delà d'un seul appel à render() : une modification dans une
  // modale (ex. changer le foyer d'un membre) déclenche un loadAppData(),
  // qui affiche brièvement l'écran de chargement (la modale disparaît du
  // DOM) avant de la recréer une fois les données rechargées. Sans ça, la
  // modale recréée repart toujours en haut, ce qui donne l'impression que
  // la page "s'est rechargée" et a perdu la modification qu'on venait de
  // faire plus bas dans la liste.
  var lastModalScrollTop = null;

  function render() {
    var root = document.getElementById('app');
    var focusInfo = captureFocus(root);
    var priorModalSheet = root.querySelector('.modal-sheet');
    if (priorModalSheet) lastModalScrollTop = priorModalSheet.scrollTop;
    root.setAttribute('data-theme', state.theme);
    if (state.passwordRecovery) {
      root.innerHTML = renderNewPasswordScreen();
    } else if (!state.loggedIn) {
      root.innerHTML = renderLogin();
    } else if (state.dataLoading || !person(state.currentUserId)) {
      root.innerHTML = renderLoadingScreen();
    } else {
      root.innerHTML = renderApp();
    }
    bindEvents(root);
    restoreFocus(root, focusInfo);
    var newModalSheet = root.querySelector('.modal-sheet');
    if (newModalSheet && lastModalScrollTop != null) newModalSheet.scrollTop = lastModalScrollTop;
  }

  function renderLoadingScreen() {
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:14px">chargement…</div>';
  }

  function renderLogin() {
    var f = state.loginForm;
    var body = '';
    if (state.loginMode === 'signup') {
      body =
        '<div class="field-label">prénom</div>' +
        '<input class="text-input" data-bind="loginName" placeholder="Toi" value="' + escapeHtml(f.name) + '" />' +
        '<div class="field-label">e-mail</div>' +
        '<input class="text-input" data-bind="loginEmail" placeholder="toi@exemple.com" value="' + escapeHtml(f.email) + '" />' +
        '<div class="field-label">mot de passe</div>' +
        '<input class="text-input" type="password" data-bind="loginPassword" placeholder="•••••••• (6 caractères min)" value="' + escapeHtml(f.password) + '" />' +
        '<button class="btn-primary pressable" data-action="submitSignup">créer le compte</button>' +
        (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
        '<div class="link-center" style="margin-top:20px" data-action="showPasswordLogin">j\'ai déjà un compte →</div>';
    } else if (state.loginMode === 'password') {
      body =
        '<div class="field-label">e-mail</div>' +
        '<input class="text-input" data-bind="loginEmail" placeholder="toi@exemple.com" value="' + escapeHtml(f.email) + '" />' +
        '<div class="field-label">mot de passe</div>' +
        '<input class="text-input" type="password" data-bind="loginPassword" placeholder="••••••••" value="' + escapeHtml(f.password) + '" />' +
        '<button class="btn-primary pressable" data-action="submitLogin">se connecter</button>' +
        (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
        '<div class="link-center" style="margin-top:12px" data-action="showForgotPassword">mot de passe oublié ?</div>' +
        '<div class="divider-or">ou</div>' +
        '<div class="link-center" data-action="toggleLoginMode">se connecter sans mot de passe →</div>' +
        '<div class="link-center" style="margin-top:12px" data-action="showSignup">pas encore de compte ? en créer un →</div>';
    } else if (state.loginMode === 'forgotPassword') {
      body = state.resetSent ?
        '<div class="magic-confirm">' +
        '<div class="magic-icon"><i class="ph-bold ph-paper-plane-tilt"></i></div>' +
        '<div class="login-title" style="font-size:20px">e-mail envoyé !</div>' +
        '<div class="login-subtitle" style="line-height:1.5">clique sur le lien reçu par e-mail pour choisir un nouveau mot de passe.</div>' +
        '<div class="link-center" style="margin-top:20px" data-action="showPasswordLogin">retour</div>' +
        '</div>' :
        '<div class="field-label">e-mail</div>' +
        '<input class="text-input" data-bind="loginEmail" placeholder="toi@exemple.com" value="' + escapeHtml(f.email) + '" />' +
        '<button class="btn-primary pressable" data-action="submitForgotPassword">envoyer le lien de réinitialisation</button>' +
        (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
        '<div class="link-center" style="margin-top:20px" data-action="showPasswordLogin">retour à la connexion →</div>';
    } else if (state.magicSent) {
      body =
        '<div class="magic-confirm">' +
        '<div class="magic-icon"><i class="ph-bold ph-paper-plane-tilt"></i></div>' +
        '<div class="login-title" style="font-size:20px">lien envoyé !</div>' +
        '<div class="login-subtitle" style="line-height:1.5">clique sur le lien reçu par e-mail pour continuer.</div>' +
        '<div class="link-center" style="margin-top:20px" data-action="backToLoginForm">retour</div>' +
        '</div>';
    } else {
      body =
        '<div class="field-label">e-mail</div>' +
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

  function renderNewPasswordScreen() {
    return (
      '<div class="login-screen">' +
      '<div class="login-icon"><i class="ph-bold ph-lock-key"></i></div>' +
      '<div class="login-title">nouveau mot de passe</div>' +
      '<div class="login-subtitle">choisis un nouveau mot de passe pour ton compte</div>' +
      '<div class="field-label">mot de passe</div>' +
      '<input class="text-input" type="password" data-bind="newPassword" placeholder="•••••••• (6 caractères min)" value="' + escapeHtml(state.newPasswordForm.password) + '" />' +
      '<button class="btn-primary pressable" data-action="submitNewPassword">mettre à jour le mot de passe</button>' +
      (state.loginError ? '<div class="form-error">' + escapeHtml(state.loginError) + '</div>' : '') +
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

  // Additionner des soldes/montants de groupes en devises différentes n'a pas
  // de sens (la somme ne correspond à aucune monnaie réelle) : on ne montre
  // un agrégat "tous les groupes" que si tous les groupes du compte partagent
  // la même devise, sinon on invite explicitement à filtrer par groupe.
  function groupsHaveSingleCurrency() {
    if (state.groups.length === 0) return true;
    var first = state.groups[0].currency;
    return state.groups.every(function (g) { return g.currency === first; });
  }

  function renderGroupFilterPills(selectedId, action) {
    if (state.groups.length < 2) return '';
    var allPill = '<div class="pill' + (!selectedId ? ' active' : '') + '" data-action="' + action + '" data-id="">tous les groupes</div>';
    var groupPills = state.groups.map(function (g) {
      return '<div class="pill' + (selectedId === g.id ? ' active' : '') + '" data-action="' + action + '" data-id="' + g.id + '">' + escapeHtml(g.name) + '</div>';
    }).join('');
    return '<div class="pill-row" style="margin-bottom:16px">' + allPill + groupPills + '</div>';
  }

  function renderHome() {
    var moi = state.currentUserId;
    var cu = person(moi);
    var filterId = state.homeGroupFilter && group(state.homeGroupFilter) ? state.homeGroupFilter : null;
    var filterGroup = filterId ? group(filterId) : null;
    var fmtC = function (n) { return fmtIn(n, filterGroup ? filterGroup.currency : null); };
    var globalDebts = filterId ? computeDebtsForGroup(filterId) : computeDebts();
    var otherPeople = state.people.filter(function (p) {
      if (p.id === moi || p.guardianId) return false;
      return filterGroup ? filterGroup.memberIds.indexOf(p.id) !== -1 : true;
    });
    var relevantExpenses = filterId ? state.expenses.filter(function (e) { return e.groupId === filterId; }) : state.expenses;
    var pendingShare = calc.computePendingShare(state.people, relevantExpenses, moi);

    var owed = 0, owe = 0;
    var rows = otherPeople.map(function (p) {
      var bal = pairNet(moi, p.id, globalDebts);
      if (bal > 0) owed += bal; else owe += -bal;
      var covered = p.guardianId ? person(p.guardianId) : null;
      var amountLabel = Math.abs(bal) < 0.5 ? 'à jour' : (bal > 0 ? 'te doit ' + fmtC(bal) : 'tu dois ' + fmtC(-bal));
      return (
        '<button class="person-row pressable" data-action="openPerson" data-id="' + p.id + '">' +
        '<div class="avatar avatar-38" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
        '<div style="flex:1;min-width:0;text-align:left">' +
        '<div class="person-name">' + escapeHtml(p.name) + '</div>' +
        shareBadge(p, false) +
        (covered ? '<div class="covered-note">pris en charge par ' + escapeHtml(covered.name) + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
        '<div class="person-amount" style="color:' + colorForBalance(bal) + '">' + escapeHtml(amountLabel) + '</div>' +
        (bal > 0.5 ? '<span class="remind-link" data-action="remind" data-id="' + p.id + '" data-group-id="' + (filterId || '') + '">envoyer un rappel →</span>' : '') +
        '</div></button>'
      );
    }).join('');

    var sum = owed - owe;
    var mixedCurrencies = !filterId && !groupsHaveSingleCurrency();

    return (
      renderGroupFilterPills(filterId, 'setHomeGroupFilter') +
      '<button class="current-user-row pressable" data-action="openAccount">' +
      '<div class="avatar avatar-26" style="background:' + cu.color + '">' + initials(cu.name) + '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">connecté en tant que <b style="color:var(--text-primary);font-weight:700">' + escapeHtml(cu.name) + '</b></div>' +
      '<i class="ph-bold ph-caret-down" style="font-size:11px;color:var(--text-tertiary)"></i>' +
      '</button>' +
      (state.groups.length === 0 ?
        '<div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px">Crée un groupe et invite des amis pour commencer à suivre vos dépenses.</div>' +
        '<button class="btn-primary pressable" data-action="openAddGroup">créer un groupe</button>' :
      mixedCurrencies ?
        '<div class="warning-banner"><div class="warning-banner-title"><i class="ph-bold ph-coins"></i> devises multiples</div>' +
        '<div class="warning-banner-body">Tes groupes utilisent des devises différentes — choisis un groupe ci-dessus pour voir ton solde.</div></div>' :
        '<div class="balance-card">' +
        '<div class="balance-label">solde net total' + (filterGroup ? ' · ' + escapeHtml(filterGroup.name) : '') + '</div>' +
        '<div class="balance-amount" style="color:' + colorForBalance(sum) + '">' + (sum >= 0 ? '+' : '-') + fmtC(Math.abs(sum)).replace('-', '') + '</div>' +
        '<div class="balance-detail-row"><div class="owed">on te doit ' + fmtC(owed).replace('-', '') + '</div><div class="owe">tu dois ' + fmtC(owe).replace('-', '') + '</div></div>' +
        '</div>') +
      (!mixedCurrencies && pendingShare > 0.5 ?
        '<div class="warning-banner"><div class="warning-banner-title"><i class="ph-bold ph-clock-countdown"></i> à anticiper</div>' +
        '<div class="warning-banner-body">Un acompte n\'est pas encore payé en totalité. Ta part : ' + fmtC(pendingShare) + '.</div></div>' : '') +
      (!mixedCurrencies && otherPeople.length > 0 ? '<div class="section-label">par personne</div>' + rows : '')
    );
  }

  function renderGroups() {
    var moi = state.currentUserId;
    var cards = state.groups.map(function (g) {
      var bal = netBalanceFor(moi, g.id);
      var names = g.memberIds.map(function (id) { return person(id).name; }).join(', ');
      var summary = Math.abs(bal) < 0.5 ? 'équilibré' : (bal > 0 ? '+' + fmtIn(bal, g.currency) : fmtIn(bal, g.currency));
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

  // Regroupe les membres d'un groupe partageant un même foyer en une seule
  // "unité" d'affichage (vue consolidée par foyer) : paid/part/solde
  // sommés, membres listés en sous-titre. Le moteur de calcul (calc.js)
  // continue de travailler personne par personne — cette consolidation
  // est purement un regroupement d'affichage, appliqué seulement aux
  // membres qui ont effectivement un foyer commun dans ce groupe.
  function computeGroupUnits(g, effectiveIds) {
    var groupHouseholds = state.households.filter(function (h) { return h.groupId === g.id; });
    var units = [];
    var unitByHousehold = {};
    effectiveIds.forEach(function (pid) {
      var p = person(pid);
      var h = p.householdId ? groupHouseholds.find(function (x) { return x.id === p.householdId; }) : null;
      if (!h) { units.push({ key: pid, label: p.name, memberIds: [pid] }); return; }
      var existing = unitByHousehold[h.id];
      if (existing) { existing.memberIds.push(pid); return; }
      var unit = { key: 'foyer:' + h.id, label: h.name, memberIds: [pid] };
      unitByHousehold[h.id] = unit;
      units.push(unit);
    });
    return units;
  }

  // Reprend les suggestions de règlement calculées personne par personne
  // (calc.simplify) et les consolide par foyer : un règlement entre deux
  // membres d'un même foyer devient interne (plus besoin de le suggérer),
  // et les montants entre deux mêmes foyers/personnes sont additionnés en
  // une seule suggestion nette.
  function consolidateSuggestionsByUnit(txns, units) {
    var unitKeyOfPerson = {}, labelOfUnit = {};
    units.forEach(function (u) {
      labelOfUnit[u.key] = u.label;
      u.memberIds.forEach(function (pid) { unitKeyOfPerson[pid] = u.key; });
    });
    var totals = {};
    txns.forEach(function (t) {
      var fu = unitKeyOfPerson[t.from], tu = unitKeyOfPerson[t.to];
      if (!fu || !tu || fu === tu) return;
      var k = fu + '>' + tu;
      totals[k] = (totals[k] || 0) + t.amount;
    });
    var seen = {}, out = [];
    Object.keys(totals).forEach(function (k) {
      if (seen[k]) return;
      seen[k] = true;
      var parts = k.split('>'), fu = parts[0], tu = parts[1];
      var revKey = tu + '>' + fu;
      var amt = totals[k];
      if (totals[revKey] != null) {
        seen[revKey] = true;
        var net = amt - totals[revKey];
        if (Math.abs(net) < 0.005) return;
        if (net > 0) out.push({ fromLabel: labelOfUnit[fu], toLabel: labelOfUnit[tu], amount: net });
        else out.push({ fromLabel: labelOfUnit[tu], toLabel: labelOfUnit[fu], amount: -net });
      } else {
        out.push({ fromLabel: labelOfUnit[fu], toLabel: labelOfUnit[tu], amount: amt });
      }
    });
    return out;
  }

  function setEquilibrerMode(mode) { setState({ equilibrerMode: mode }); }

  function renderGroupDetail() {
    var g = group(state.selectedGroupId);
    if (!g) return '';
    var moi = state.currentUserId;
    var isAdmin = g.adminId === moi;
    var debts = computeDebtsForGroup(g.id);

    // Un retrait de "gérer les membres" enlève l'adhésion au groupe, mais un
    // solde non réglé doit rester visible ici (les dépenses passées restent
    // comptées dans les calculs) : on réintègre à l'affichage toute personne
    // qui a un solde non nul dans ce groupe même si elle n'en est plus membre.
    var effectiveIds = g.memberIds.slice();
    state.people.forEach(function (p) {
      if (effectiveIds.indexOf(p.id) !== -1) return;
      var hasExpenseHere = state.expenses.some(function (e) { return e.groupId === g.id && (e.paidBy === p.id || e.participants.indexOf(p.id) !== -1); });
      if (!hasExpenseHere) return;
      if (Math.abs(netBalanceFor(p.id, g.id)) > 0.5) effectiveIds.push(p.id);
    });

    var units = computeGroupUnits(g, effectiveIds);
    var memberRows = units.map(function (u) {
      var isHousehold = u.memberIds.length > 1;
      var paid = 0, share = 0, bal = 0;
      u.memberIds.forEach(function (pid) {
        paid += state.expenses.filter(function (e) { return e.groupId === g.id && e.paidBy === pid; })
          .reduce(function (a, e) { return a + (e.paidExternal != null ? e.paidExternal : e.amount); }, 0);
        state.expenses.filter(function (e) { return e.groupId === g.id && e.participants.indexOf(pid) !== -1; }).forEach(function (e) {
          var effAmount = e.paidExternal != null ? e.paidExternal : e.amount;
          var shares = calc.computeShares(effAmount, e.participants, state.people);
          share += shares[pid] || 0;
        });
        bal += netBalanceFor(pid, g.id);
      });

      if (!isHousehold) {
        var pid0 = u.memberIds[0];
        var p = person(pid0);
        var isExMember = g.memberIds.indexOf(pid0) === -1;
        var covered = p.guardianId ? person(p.guardianId) : null;
        var balLabel = covered ? '→ ' + covered.name : (Math.abs(bal) < 0.5 ? '0,00' : fmtIn(bal, g.currency));
        var balColor = covered ? 'var(--status-neutral)' : colorForBalance(bal);
        return (
          '<div class="member-row">' +
          '<div class="avatar avatar-30" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
          '<div class="col-name">' + escapeHtml(p.name) + (isExMember ? '<span class="badge-child inline">ex-membre</span>' : '') + shareBadge(p, true) + '</div>' +
          '<div class="col-num">' + fmtIn(paid, g.currency) + '</div>' +
          '<div class="col-num">' + fmtIn(share, g.currency) + '</div>' +
          '<div class="col-bal" style="color:' + balColor + '">' + escapeHtml(balLabel) + '</div>' +
          '</div>'
        );
      }

      var memberNames = u.memberIds.map(function (pid) { return person(pid).name; }).join(', ');
      var balLabelH = Math.abs(bal) < 0.5 ? '0,00' : fmtIn(bal, g.currency);
      return (
        '<div class="member-row">' +
        '<div class="avatar avatar-30" style="background:var(--surface-overlay);color:var(--text-secondary)"><i class="ph-bold ph-house-line"></i></div>' +
        '<div class="col-name">' + escapeHtml(u.label) + '<span class="badge-child inline">foyer</span>' +
        '<div style="font-size:11px;font-weight:400;color:var(--text-tertiary);margin-top:2px">' + escapeHtml(memberNames) + '</div></div>' +
        '<div class="col-num">' + fmtIn(paid, g.currency) + '</div>' +
        '<div class="col-num">' + fmtIn(share, g.currency) + '</div>' +
        '<div class="col-bal" style="color:' + colorForBalance(bal) + '">' + escapeHtml(balLabelH) + '</div>' +
        '</div>'
      );
    }).join('');

    // "pour équilibrer" peut se voir par foyer (défaut, unités consolidées
    // comme le tableau payé/part/solde) ou par membre (chaque personne
    // séparément) — le bouton n'est proposé que si au moins un foyer
    // regroupe effectivement plusieurs membres de ce groupe, sinon les deux
    // vues seraient strictement identiques.
    var hasFoyerConsolidation = units.some(function (u) { return u.memberIds.length > 1; });
    var identityUnits = effectiveIds.map(function (pid) { return { key: pid, label: person(pid).name, memberIds: [pid] }; });
    var equilibrerUnits = hasFoyerConsolidation && state.equilibrerMode === 'membre' ? identityUnits : units;
    var txns = consolidateSuggestionsByUnit(calc.simplify(debts, effectiveIds), equilibrerUnits);
    var suggestions = txns.map(function (t) {
      return '<div class="suggestion-row"><div><b>' + escapeHtml(t.fromLabel) + '</b> → <b>' + escapeHtml(t.toLabel) + '</b></div>' +
        '<div class="suggestion-amount">' + fmtIn(t.amount, g.currency) + '</div></div>';
    }).join('');
    var equilibrerToggle = !hasFoyerConsolidation ? '' :
      '<div class="pill-row" style="margin-bottom:10px">' +
      '<div class="pill' + (state.equilibrerMode !== 'membre' ? ' active' : '') + '" data-action="setEquilibrerMode" data-id="foyer">par foyer</div>' +
      '<div class="pill' + (state.equilibrerMode === 'membre' ? ' active' : '') + '" data-action="setEquilibrerMode" data-id="membre">par membre</div>' +
      '</div>';

    var expenseRows = state.expenses.filter(function (e) { return e.groupId === g.id; })
      .slice().sort(function (a, b) { return b.date.localeCompare(a.date); })
      .map(function (e) {
        return (
          '<div class="expense-row pressable" data-action="editExpense" data-id="' + e.id + '">' +
          '<div class="expense-icon"><i class="' + e.icon + '"></i></div>' +
          '<div style="flex:1;min-width:0">' +
          '<div class="expense-label">' + escapeHtml(e.label) + (e.receiptPath ? ' <i class="ph-bold ph-paperclip" style="font-size:12px;color:var(--text-tertiary)"></i>' : '') + '</div>' +
          '<div class="expense-subtitle">payé par ' + escapeHtml(person(e.paidBy).name) + ' · ' + fmtDate(e.date) + ' · ' + e.participants.length + ' pers.</div>' +
          '</div><div class="expense-amount">' + fmtIn(e.amount, g.currency) + '</div></div>'
        );
      }).join('');

    return (
      '<div class="member-table"><div class="section-label">payé / part / solde</div>' + memberRows + '</div>' +
      (isAdmin ?
        '<div class="admin-actions">' +
        '<button class="btn-outline pressable" data-action="openManageMembers" data-id="' + g.id + '"><i class="ph-bold ph-users-three"></i> gérer les membres</button>' +
        '<button class="btn-icon-danger pressable" data-action="openConfirmDeleteGroup" data-id="' + g.id + '"><i class="ph-bold ph-trash"></i></button>' +
        '</div>' :
        '<div class="admin-actions">' +
        '<button class="btn-outline pressable" data-action="openConfirmLeaveGroup" data-id="' + g.id + '"><i class="ph-bold ph-door-open"></i> quitter ce groupe</button>' +
        '</div>') +
      (txns.length || hasFoyerConsolidation ?
        '<div class="section-label">pour équilibrer</div>' + equilibrerToggle +
        (txns.length ? suggestions : '<div style="font-size:13px;color:var(--text-tertiary);margin-bottom:14px">rien à régler pour le moment.</div>') : '') +
      '<div class="section-label" style="margin-top:18px">dépenses</div>' + expenseRows +
      '<button class="btn-primary pressable" style="margin-top:18px" data-action="openAddExpenseForGroup">ajouter une dépense</button>'
    );
  }

  function renderPersonDetail() {
    var p = person(state.selectedPersonId);
    if (!p) return '';
    var moi = state.currentUserId;
    var filterId = state.personGroupFilter && group(state.personGroupFilter) ? state.personGroupFilter : null;
    var filterGroup = filterId ? group(filterId) : null;
    var fmtC = function (n) { return fmtIn(n, filterGroup ? filterGroup.currency : null); };
    var bal = filterId ? pairNet(moi, p.id, computeDebtsForGroup(filterId)) : pairNet(moi, p.id);
    var covered = p.guardianId ? person(p.guardianId) : null;
    var lastReminder = state.reminders.slice().reverse().find(function (r) { return r.toPersonId === p.id; });
    var relatedExpenses = state.expenses.filter(function (e) {
      return (e.participants.indexOf(p.id) !== -1 || e.paidBy === p.id) && (!filterId || e.groupId === filterId);
    }).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });

    var amountLabel = Math.abs(bal) < 0.5 ? 'à jour' : (bal > 0 ? 'te doit ' + fmtC(bal) : 'tu dois ' + fmtC(-bal));

    return (
      renderGroupFilterPills(filterId, 'setPersonGroupFilter') +
      '<div class="person-header">' +
      '<div class="avatar avatar-64" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
      '<div class="person-header-name">' + escapeHtml(p.name) + '</div>' +
      (hasCustomWeight(p) ? '<div style="margin-top:8px">' + shareBadge(p, false) + '</div>' : '') +
      (covered ? '<div class="covered-note" style="margin-top:6px">pris en charge par ' + escapeHtml(covered.name) + '</div>' : '') +
      '<div class="person-header-amount" style="color:' + colorForBalance(bal) + '">' + escapeHtml(amountLabel) + '</div>' +
      '</div>' +
      '<div class="person-actions">' +
      (bal > 0.5 ? '<button class="btn-danger-fill pressable" data-action="remind" data-id="' + p.id + '" data-group-id="' + (filterId || '') + '"><i class="ph-bold ph-bell-ringing" style="margin-right:6px"></i>envoyer un rappel</button>' : '') +
      '<button class="btn-outline-flex pressable" data-action="openSettle" data-id="' + p.id + '" data-group-id="' + (filterId || '') + '">enregistrer un paiement</button>' +
      '</div>' +
      (lastReminder ? '<div class="reminder-preview">' + escapeHtml(lastReminder.message) + '</div>' : '') +
      '<div class="section-label">dépenses concernées</div>' +
      relatedExpenses.map(function (e) {
        var eg = group(e.groupId);
        return '<div class="person-expense-row"><i class="' + e.icon + '" style="color:var(--text-secondary);font-size:15px;width:18px;text-align:center"></i>' +
          '<div style="flex:1;font-size:13.5px;color:var(--text-primary)">' + escapeHtml(e.label) + '</div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--text-secondary)">' + fmtIn(e.amount, eg && eg.currency) + '</div></div>';
      }).join('')
    );
  }

  function renderAllExpenses() {
    var filterId = state.expensesGroupFilter && group(state.expensesGroupFilter) ? state.expensesGroupFilter : null;
    var filterGroup = filterId ? group(filterId) : null;
    var fmtC = function (n) { return fmtIn(n, filterGroup ? filterGroup.currency : null); };
    var expenses = filterId ? state.expenses.filter(function (e) { return e.groupId === filterId; }) : state.expenses;
    var payments = filterId ? state.payments.filter(function (p) { return p.groupId === filterId; }) : state.payments;
    var statuses = calc.computeExpenseStatuses(state.people, expenses, payments);
    var total = expenses.reduce(function (a, e) { return a + e.amount; }, 0);
    var totalOwed = Object.values(statuses).reduce(function (a, st) { return a + st.owed; }, 0);
    var totalRemaining = Object.values(statuses).reduce(function (a, st) { return a + st.remaining; }, 0);
    var totalDueExternal = expenses.reduce(function (a, e) { return a + (e.amount - (e.paidExternal != null ? e.paidExternal : e.amount)); }, 0);

    var searchQuery = (state.expensesSearchQuery || '').trim().toLowerCase();
    var visibleExpenses = !searchQuery ? expenses : expenses.filter(function (e) {
      var g = group(e.groupId);
      return e.label.toLowerCase().indexOf(searchQuery) !== -1
        || person(e.paidBy).name.toLowerCase().indexOf(searchQuery) !== -1
        || (g && g.name.toLowerCase().indexOf(searchQuery) !== -1);
    });

    var rows = visibleExpenses.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (e) {
      var g = group(e.groupId);
      var cur = g && g.currency;
      var st = statuses[e.id];
      var paidExternal = e.paidExternal != null ? e.paidExternal : e.amount;
      var dueExternal = e.amount - paidExternal;
      return (
        '<div class="expense-row">' +
        '<div class="expense-icon pressable" data-action="editExpense" data-id="' + e.id + '"><i class="' + e.icon + '"></i></div>' +
        '<div style="flex:1;min-width:0;cursor:pointer" data-action="editExpense" data-id="' + e.id + '">' +
        '<div class="expense-label">' + escapeHtml(e.label) + (e.receiptPath ? ' <i class="ph-bold ph-paperclip" style="font-size:12px;color:var(--text-tertiary)"></i>' : '') + '</div>' +
        '<div class="expense-subtitle">' + (g ? escapeHtml(g.name) + ' · ' : '') + 'payé par ' + escapeHtml(person(e.paidBy).name) + ' · ' + fmtDate(e.date) + ' · ' + e.participants.length + ' pers.</div>' +
        '<div class="expense-meta-row">' +
        '<span class="status-badge" style="color:' + st.color + ';background:' + st.bg + '">' + st.status + '</span>' +
        (st.remaining > 0.5 ? '<span style="font-size:11px;color:var(--text-tertiary)">' + fmtIn(st.remaining, cur) + ' restant entre vous</span>' : '') +
        '</div>' +
        (dueExternal > 0.5 ?
          '<div class="due-external">acompte versé ' + fmtIn(paidExternal, cur) + ' · reste ' + fmtIn(dueExternal, cur) + ' à verser au bailleur</div>' +
          '<button class="mark-paid-link" data-action="markPaidFull" data-id="' + e.id + '">marquer réglé en totalité →</button>' : '') +
        '</div>' +
        '<div class="expense-amount">' + fmtIn(e.amount, cur) + '</div>' +
        '</div>'
      );
    }).join('');

    var mixedCurrencies = !filterId && !groupsHaveSingleCurrency();

    return (
      renderGroupFilterPills(filterId, 'setExpensesGroupFilter') +
      (mixedCurrencies ?
        '<div class="warning-banner"><div class="warning-banner-title"><i class="ph-bold ph-coins"></i> devises multiples</div>' +
        '<div class="warning-banner-body">Tes groupes utilisent des devises différentes — choisis un groupe ci-dessus pour voir les totaux.</div></div>' :
        '<div class="summary-cards">' +
        '<div class="summary-card"><div class="summary-card-label">total</div><div class="summary-card-value" style="color:var(--text-primary)">' + fmtC(total) + '</div></div>' +
        '<div class="summary-card"><div class="summary-card-label">remboursé</div><div class="summary-card-value" style="color:var(--status-positive)">' + fmtC(totalOwed - totalRemaining) + '</div></div>' +
        '<div class="summary-card"><div class="summary-card-label">restant dû</div><div class="summary-card-value" style="color:var(--status-danger)">' + fmtC(totalRemaining) + '</div></div>' +
        '</div>' +
        (totalDueExternal > 0.5 ? '<div class="warning-banner" style="padding:10px 14px;font-size:12.5px">' + fmtC(totalDueExternal) + ' restent à verser à des tiers (acomptes non soldés)</div>' : '')) +
      (expenses.length > 0 ?
        '<input class="text-input" data-bind="expensesSearch" placeholder="rechercher une dépense..." value="' + escapeHtml(state.expensesSearchQuery) + '" />' : '') +
      (expenses.length === 0 ? '<div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px">aucune dépense dans ce groupe.</div>' :
        visibleExpenses.length === 0 ? '<div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px">aucune dépense ne correspond à « ' + escapeHtml(state.expensesSearchQuery) + ' ».</div>' : rows) +
      '<button class="btn-primary pressable" style="margin-top:18px" data-action="openAddExpenseGlobal" data-id="' + (filterId || '') + '">ajouter une dépense</button>'
    );
  }

  function renderHistory() {
    var items = [];
    state.expenses.forEach(function (e) {
      var g = group(e.groupId);
      items.push({ date: e.date, icon: e.icon, iconBg: 'var(--surface-overlay)', iconColor: 'var(--text-secondary)', text: escapeHtml(person(e.paidBy).name) + ' a payé « ' + escapeHtml(e.label) + ' »' + (g ? ' · ' + escapeHtml(g.name) : ''), amountLabel: fmtIn(e.amount, g && g.currency), color: 'var(--text-primary)' });
    });
    state.payments.forEach(function (p) {
      var pg = p.groupId ? group(p.groupId) : null;
      items.push({ date: p.date, icon: 'ph-bold ph-check-circle', iconBg: 'var(--status-positive-bg)', iconColor: 'var(--status-positive)', text: escapeHtml(person(p.from).name) + ' → ' + escapeHtml(person(p.to).name), amountLabel: fmtIn(p.amount, pg && pg.currency), color: 'var(--status-positive)' });
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
    if (state.showAccount) out += renderAccountModal();
    if (state.showManageMembers) out += renderManageMembersModal();
    if (state.showConfirmDeleteGroup) out += renderConfirmDeleteGroupModal();
    if (state.showConfirmRemoveMember) out += renderConfirmRemoveMemberModal();
    if (state.showConfirmLeaveGroup) out += renderConfirmLeaveGroupModal();
    return out;
  }

  function renderConfirmDeleteGroupModal() {
    var g = group(state.confirmDeleteGroupId);
    if (!g) return '';
    var expenseCount = state.expenses.filter(function (e) { return e.groupId === g.id; }).length;
    return (
      '<div class="modal-overlay center" data-action="closeModal">' +
      '<div class="modal-card" data-stop-click>' +
      '<div class="modal-title" style="margin-bottom:14px">supprimer « ' + escapeHtml(g.name) + ' » ?</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:18px">' +
      (expenseCount > 0
        ? 'Cette action supprimera aussi ' + (expenseCount > 1 ? 'ses ' + expenseCount + ' dépenses associées.' : 'sa dépense associée.')
        : 'Cette action est définitive.') +
      '</div>' +
      '<div class="modal-footer-buttons">' +
      '<button class="btn-cancel pressable" data-action="closeModal">annuler</button>' +
      '<button class="btn-confirm pressable" style="background:var(--status-danger)" data-action="confirmDeleteGroup">supprimer</button>' +
      '</div></div></div>'
    );
  }

  function renderConfirmRemoveMemberModal() {
    var g = group(state.confirmRemoveMemberGroupId);
    var p = person(state.confirmRemoveMemberId);
    if (!g || !p) return '';
    var expenseCount = state.expenses.filter(function (e) {
      return e.groupId === g.id && (e.paidBy === p.id || e.participants.indexOf(p.id) !== -1);
    }).length;
    var bal = netBalanceFor(p.id, g.id);
    var hasBalance = Math.abs(bal) > 0.5;
    return (
      '<div class="modal-overlay center" data-action="cancelRemoveMember">' +
      '<div class="modal-card" data-stop-click>' +
      '<div class="modal-title" style="margin-bottom:14px">retirer ' + escapeHtml(p.name) + ' du groupe « ' + escapeHtml(g.name) + ' » ?</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:18px">' +
      (hasBalance
        ? escapeHtml(p.name) + ' a un solde non réglé de ' + fmtIn(Math.abs(bal), g.currency) + ' dans ce groupe — il restera affiché ici (marqué « ex-membre ») tant qu\'il n\'est pas soldé.'
        : expenseCount > 0
          ? escapeHtml(p.name) + ' est lié à ' + expenseCount + (expenseCount > 1 ? ' dépenses' : ' dépense') + ' de ce groupe — elles resteront dans l\'historique.'
          : escapeHtml(p.name) + ' n\'a aucune dépense dans ce groupe.') +
      '</div>' +
      '<div class="modal-footer-buttons">' +
      '<button class="btn-cancel pressable" data-action="cancelRemoveMember">annuler</button>' +
      '<button class="btn-confirm pressable" style="background:var(--status-danger)" data-action="confirmRemoveMember">retirer</button>' +
      '</div></div></div>'
    );
  }

  function renderConfirmLeaveGroupModal() {
    var g = group(state.confirmLeaveGroupId);
    if (!g) return '';
    var bal = netBalanceFor(state.currentUserId, g.id);
    var hasBalance = Math.abs(bal) > 0.5;
    return (
      '<div class="modal-overlay center" data-action="cancelLeaveGroup">' +
      '<div class="modal-card" data-stop-click>' +
      '<div class="modal-title" style="margin-bottom:14px">quitter « ' + escapeHtml(g.name) + ' » ?</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:18px">' +
      (hasBalance
        ? 'Tu as un solde non réglé de ' + fmtIn(Math.abs(bal), g.currency) + ' dans ce groupe — il reste dû même après ton départ. Tu ne verras plus ce groupe ; seul l\'admin pourra t\'y réintégrer.'
        : 'Tu ne verras plus ce groupe. Seul l\'admin pourra t\'y réintégrer.') +
      '</div>' +
      '<div class="modal-footer-buttons">' +
      '<button class="btn-cancel pressable" data-action="cancelLeaveGroup">annuler</button>' +
      '<button class="btn-confirm pressable" style="background:var(--status-danger)" data-action="confirmLeaveGroup">quitter</button>' +
      '</div></div></div>'
    );
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
        '<div class="col-name">' + escapeHtml(p.name) + shareBadge(p, true) + '</div>' +
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
      '<div class="field-label">catégorie</div>' +
      '<div class="pill-row">' + seed.EXPENSE_CATEGORIES.map(function (c) {
        return '<div class="pill' + (f.category === c.id ? ' active' : '') + '" data-action="setCategory" data-id="' + c.id + '"><i class="' + c.icon + '" style="margin-right:5px"></i>' + escapeHtml(c.label) + '</div>';
      }).join('') + '</div>' +
      '<div class="field-label">montant (' + currencySymbolFor(currentGroup && currentGroup.currency) + ')</div>' +
      '<input class="text-input" data-bind="expenseAmount" placeholder="0,00" inputmode="decimal" value="' + escapeHtml(f.amount) + '" />' +
      '<div class="field-label">date</div>' +
      '<input class="text-input" type="date" data-bind="expenseDate" value="' + escapeHtml(f.date) + '" />' +
      '<div class="checkbox-row" style="border-top:none;margin-bottom:16px" data-action="toggleFullyPaid">' +
      '<div class="checkbox' + (f.fullyPaid ? ' checked' : '') + '">' + (f.fullyPaid ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
      '<div style="font-size:13.5px;color:var(--text-primary);font-weight:600">payée intégralement (pas d\'acompte)</div></div>' +
      (!f.fullyPaid ?
        '<div class="field-label">déjà versé au tiers (' + currencySymbolFor(currentGroup && currentGroup.currency) + ')</div>' +
        '<input class="text-input" data-bind="paidExternal" placeholder="ex : 500" inputmode="decimal" value="' + escapeHtml(f.paidExternal) + '" />' : '') +
      '<div class="field-label">payé par</div><div class="pill-row">' + payerChoices + '</div>' +
      '<div class="section-label">qui participe ?</div>' + participantRows +
      '<div class="field-label">reçu / pièce jointe (facultatif)</div>' +
      (f.receiptPath && !f.receiptRemove ?
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<button type="button" class="btn-outline pressable" style="flex:1" data-action="viewReceipt" data-path="' + escapeHtml(f.receiptPath) + '"><i class="ph-bold ph-paperclip"></i> voir le reçu actuel</button>' +
        '<button type="button" class="btn-icon-danger pressable" style="width:38px;flex-shrink:0" data-action="removeReceipt" title="retirer le reçu"><i class="ph-bold ph-trash"></i></button>' +
        '</div>' : '') +
      '<input class="text-input" type="file" accept="image/*,.pdf" data-bind-change="receiptFile" />' +
      (f.receiptFile ? '<div style="font-size:11.5px;color:var(--text-tertiary);margin:-10px 0 14px">fichier sélectionné : ' + escapeHtml(f.receiptFile.name) + '</div>' : '') +
      '<button class="btn-primary pressable" style="margin-top:20px" data-action="submitExpense">' + (f.editingId ? 'enregistrer les modifications' : 'enregistrer la dépense') + '</button>' +
      (state.formError ? '<div class="form-error">' + escapeHtml(state.formError) + '</div>' : '') +
      (f.editingId ? '<button class="delete-link" data-action="deleteExpense">supprimer cette dépense</button>' : '') +
      '</div></div>'
    );
  }

  function renderAddGroupModal() {
    var gf = state.groupForm;
    var currencyChoices = seed.CURRENCIES.map(function (c) {
      return '<div class="pill' + (gf.currency === c.code ? ' active' : '') + '" data-action="setGroupCurrency" data-id="' + c.code + '">' + c.code + ' ' + c.symbol + '</div>';
    }).join('');
    var inviteeRows = gf.invitees.map(function (inv, i) {
      return (
        '<div style="background:var(--surface-overlay);border-radius:14px;padding:12px;margin-bottom:10px">' +
        '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<input class="text-input" style="margin-bottom:0" data-bind="inviteeName" data-id="' + i + '" placeholder="prénom" value="' + escapeHtml(inv.name) + '" />' +
        (gf.invitees.length > 1 ? '<button class="btn-icon-danger pressable" style="width:38px;flex-shrink:0" data-action="removeInviteeRow" data-id="' + i + '"><i class="ph-bold ph-x"></i></button>' : '') +
        '</div>' +
        '<input class="text-input" data-bind="inviteeEmail" data-id="' + i + '" placeholder="e-mail" value="' + escapeHtml(inv.email) + '" style="margin-bottom:8px" />' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:12.5px;color:var(--text-secondary)">part (1 = part entière)</span>' +
        '<input class="child-percent-input" data-bind="inviteeShare" data-id="' + i + '" value="' + escapeHtml(inv.shareWeight) + '" inputmode="decimal" />' +
        '</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">nouveau groupe</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="field-label">nom</div>' +
      '<input class="text-input" data-bind="groupName" placeholder="ex : week-end à lyon" value="' + escapeHtml(gf.name) + '" />' +
      '<div class="field-label">devise</div><div class="pill-row">' + currencyChoices + '</div>' +
      '<div class="section-label">inviter des membres (par e-mail)</div>' +
      inviteeRows +
      '<button class="dashed-btn pressable" style="margin-bottom:6px" data-action="addInviteeRow">+ ajouter un membre</button>' +
      '<button class="btn-primary pressable" style="margin-top:14px' + (state.submittingGroup ? ';opacity:0.6' : '') + '" data-action="submitGroup">' +
      (state.submittingGroup ? 'création en cours…' : 'créer le groupe') + '</button>' +
      (state.formError ? '<div class="form-error">' + escapeHtml(state.formError) + '</div>' : '') +
      '</div></div>'
    );
  }

  function renderSettleModal() {
    var sf = state.settleForm;
    var fromName = sf.from ? person(sf.from).name : '';
    var toName = sf.to ? person(sf.to).name : '';
    var settleGroup = state.settleGroupId ? group(state.settleGroupId) : null;
    return (
      '<div class="modal-overlay center" data-action="closeModal">' +
      '<div class="modal-card" data-stop-click>' +
      '<div class="modal-title" style="margin-bottom:14px">enregistrer un paiement</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:14px">' + escapeHtml(fromName) + ' → ' + escapeHtml(toName) + '</div>' +
      '<div class="field-label">montant (' + currencySymbolFor(settleGroup && settleGroup.currency) + ')</div>' +
      '<input class="text-input" data-bind="settleAmount" inputmode="decimal" value="' + escapeHtml(sf.amount) + '" />' +
      '<div class="modal-footer-buttons">' +
      '<button class="btn-cancel pressable" data-action="closeModal">annuler</button>' +
      '<button class="btn-confirm pressable" data-action="submitSettle">confirmer</button>' +
      '</div></div></div>'
    );
  }

  function renderAccountModal() {
    var cu = person(state.currentUserId);
    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">mon compte</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      '<div style="display:flex;align-items:center;gap:12px;padding:4px 0 22px">' +
      '<div class="avatar avatar-38" style="background:' + cu.color + '">' + initials(cu.name) + '</div>' +
      '<div style="font-size:15px;font-weight:600;color:var(--text-primary)">' + escapeHtml(cu.name) + '</div>' +
      '</div>' +
      '<button class="delete-link" data-action="logout"><i class="ph-bold ph-sign-out" style="margin-right:6px"></i>se déconnecter</button>' +
      '</div></div>'
    );
  }

  function renderManageMembersModal() {
    var mg = group(state.manageMembersGroupId);
    if (!mg) return '';
    // Seules les personnes déjà membres de CE groupe apparaissent ici — pour
    // ajouter quelqu'un d'autre, on passe par "+ inviter un membre" (par
    // e-mail) plutôt que par une liste de tous les comptes existants.
    var members = mg.memberIds.map(function (id) { return person(id); }).filter(Boolean);

    var guardianOptionsFor = function (p) {
      var opts = '<option value=""' + (!p.guardianId ? ' selected' : '') + '>— aucun —</option>';
      opts += members.filter(function (x) { return x.id !== p.id; }).map(function (x) {
        return '<option value="' + x.id + '"' + (p.guardianId === x.id ? ' selected' : '') + '>' + escapeHtml(x.name) + '</option>';
      }).join('');
      return opts;
    };
    var groupHouseholds = state.households.filter(function (h) { return h.groupId === mg.id; });
    var householdOptionsFor = function (p) {
      var opts = '<option value=""' + (!p.householdId ? ' selected' : '') + '>— aucun foyer —</option>';
      opts += groupHouseholds.map(function (h) {
        return '<option value="' + h.id + '"' + (p.householdId === h.id ? ' selected' : '') + '>' + escapeHtml(h.name) + '</option>';
      }).join('');
      return opts;
    };
    var rows = members.map(function (p) {
      var isAdmin = p.id === mg.adminId;
      return (
        '<div style="background:var(--surface-overlay);border-radius:14px;padding:12px;margin-bottom:10px">' +
        '<div class="checkbox-row" style="border-top:none">' +
        '<div style="flex:1;font-size:14px;color:var(--text-primary);font-weight:600">' + escapeHtml(p.name) +
        (isAdmin ? ' (admin)' : '') +
        // "à charge" est un badge calculé (responsable défini), pas une
        // catégorie à choisir séparément.
        (p.guardianId ? '<span class="badge-child inline">à charge</span>' : '') +
        '</div>' +
        (!isAdmin ?
          '<button class="btn-icon-danger pressable" style="width:30px;height:30px;flex-shrink:0" data-action="openConfirmRemoveMember" data-group-id="' + mg.id + '" data-id="' + p.id + '" title="retirer du groupe"><i class="ph-bold ph-trash"></i></button>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
        '<div><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">part (1 = part entière)</div>' +
        '<input class="text-input" style="margin-bottom:0" data-bind-change="shareWeight" data-id="' + p.id + '" value="' + (p.shareWeight != null ? p.shareWeight : 1) + '" inputmode="decimal" /></div>' +
        '<div><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">responsable (si à charge)</div>' +
        '<select class="text-input" style="margin-bottom:0" data-bind-change="guardian" data-id="' + p.id + '">' + guardianOptionsFor(p) + '</select>' +
        '</div>' +
        '<div><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">foyer</div>' +
        '<select class="text-input" style="margin-bottom:0" data-bind-change="household" data-id="' + p.id + '">' + householdOptionsFor(p) + '</select></div>' +
        '</div>' +
        '</div>'
      );
    }).join('');

    var addMemberSection = !state.showAddMemberForm ? '' :
      '<div style="background:var(--surface-overlay);border-radius:14px;padding:12px;margin-bottom:14px">' +
      '<div class="field-label">prénom</div>' +
      '<input class="text-input" data-bind="addMemberName" placeholder="prénom" value="' + escapeHtml(state.addMemberForm.name) + '" />' +
      '<div class="field-label">e-mail (facultatif)</div>' +
      '<input class="text-input" data-bind="addMemberEmail" placeholder="pour envoyer une invitation" value="' + escapeHtml(state.addMemberForm.email) + '" />' +
      '<div style="font-size:11.5px;color:var(--text-tertiary);margin:-10px 0 14px">si renseigné, un e-mail d\'invitation est envoyé pour que cette personne puisse se connecter elle-même ; sinon, elle est simplement ajoutée au groupe.</div>' +
      '<div class="field-label">part (1 = part entière)</div>' +
      '<input class="text-input" data-bind="addMemberWeight" inputmode="decimal" value="' + escapeHtml(state.addMemberForm.shareWeight) + '" />' +
      '<div class="field-label">responsable (facultatif)</div>' +
      '<select class="text-input" data-bind-change="addMemberGuardian">' +
      '<option value="">— aucun —</option>' +
      members.map(function (x) { return '<option value="' + x.id + '"' + (state.addMemberForm.guardianId === x.id ? ' selected' : '') + '>' + escapeHtml(x.name) + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn-primary pressable" style="margin-top:10px' + (state.addingMember ? ';opacity:0.6' : '') + '" data-action="submitAddMember">' +
      (state.addingMember ? 'ajout en cours…' : 'ajouter') + '</button>' +
      '</div>';

    return (
      '<div class="modal-overlay bottom" data-action="closeModal">' +
      '<div class="modal-sheet" data-stop-click>' +
      '<div class="modal-header"><div class="modal-title">membres · ' + escapeHtml(mg.name) + '</div>' +
      '<button class="modal-close" data-action="closeModal"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="section-label">foyers</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px">' +
      '<input class="text-input" style="margin-bottom:0;flex:1" data-bind="newHouseholdName" placeholder="nom du foyer" value="' + escapeHtml(state.newHouseholdName) + '" />' +
      '<button class="btn-outline pressable" style="flex-shrink:0" data-action="createHousehold">+ créer</button>' +
      '</div>' +
      '<div class="section-label">participants</div>' +
      rows +
      addMemberSection +
      '<button class="dashed-btn pressable" data-action="toggleAddMemberForm">' + (state.showAddMemberForm ? 'annuler' : '+ ajouter un membre') + '</button>' +
      (state.formError ? '<div class="form-error">' + escapeHtml(state.formError) + '</div>' : '') +
      '</div></div>'
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
      var el;
      if (overlay && !stopEl) {
        // Clic sur le fond de l'overlay lui-même (en dehors de la carte/feuille
        // de la modale) : on respecte l'action que CET overlay a déclarée
        // (généralement closeModal, mais cancelRemoveMember pour la
        // confirmation imbriquée dans "gérer les membres", pour ne fermer
        // que la confirmation et pas la modale en dessous).
        el = overlay;
      } else {
        if (stopEl && e.target === stopEl) return;
        el = e.target.closest('[data-action]');
        // Un data-action trouvé en dehors du conteneur de la modale (typiquement
        // l'overlay lui-même) ne doit pas s'appliquer à un clic sur un élément
        // inerte (champ texte, libellé...) à l'intérieur de la modale — sinon
        // ça la referme au moment même où l'utilisateur essaie de taper.
        if (el && stopEl && !stopEl.contains(el)) el = null;
      }
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
        case 'remind': sendReminder(id, groupId || null); break;
        case 'openAccount': openAccount(); break;
        case 'logout': logout(); break;
        case 'openAddExpenseGlobal': openAddExpense(id || state.lastActiveGroupId || (state.groups[0] && state.groups[0].id)); break;
        case 'setHomeGroupFilter': setHomeGroupFilter(id); break;
        case 'setExpensesGroupFilter': setExpensesGroupFilter(id); break;
        case 'setPersonGroupFilter': setPersonGroupFilter(id); break;
        case 'openAddExpenseForGroup': openAddExpense(state.selectedGroupId); break;
        case 'openAddGroup': openAddGroup(); break;
        case 'openManageMembers': openManageMembers(id); break;
        case 'openConfirmDeleteGroup': openConfirmDeleteGroup(id); break;
        case 'confirmDeleteGroup': confirmDeleteGroup(); break;
        case 'editExpense': openEditExpense(id); break;
        case 'markPaidFull': markExpensePaidFull(id); break;
        case 'closeModal': closeModal(); break;
        case 'toggleLoginMode': toggleLoginMode(); break;
        case 'showSignup': showSignup(); break;
        case 'showPasswordLogin': showPasswordLogin(); break;
        case 'showForgotPassword': showForgotPassword(); break;
        case 'backToLoginForm': backToLoginForm(); break;
        case 'submitLogin': submitLogin(); break;
        case 'submitSignup': submitSignup(); break;
        case 'submitMagicLink': submitMagicLink(); break;
        case 'submitForgotPassword': submitForgotPassword(); break;
        case 'submitNewPassword': submitNewPassword(); break;
        case 'selectGroupForForm': selectGroupForForm(id); break;
        case 'selectPayer': selectPayer(id); break;
        case 'toggleParticipant': toggleParticipant(id); break;
        case 'toggleFullyPaid': toggleFullyPaid(); break;
        case 'setCategory': setCategory(id); break;
        case 'submitExpense': submitExpense(); break;
        case 'deleteExpense': deleteExpense(); break;
        case 'viewReceipt': viewReceipt(el.getAttribute('data-path')); break;
        case 'removeReceipt': removeReceipt(); break;
        case 'setGroupCurrency': setGroupCurrency(id); break;
        case 'addInviteeRow': addInviteeRow(); break;
        case 'removeInviteeRow': removeInviteeRow(parseInt(id, 10)); break;
        case 'submitGroup': submitGroup(); break;
        case 'openSettle': openSettle(id, groupId || null); break;
        case 'submitSettle': submitSettle(); break;
        case 'openConfirmRemoveMember': openConfirmRemoveMember(groupId, id); break;
        case 'cancelRemoveMember': cancelRemoveMember(); break;
        case 'confirmRemoveMember': confirmRemoveMember(); break;
        case 'openConfirmLeaveGroup': openConfirmLeaveGroup(id); break;
        case 'cancelLeaveGroup': cancelLeaveGroup(); break;
        case 'confirmLeaveGroup': confirmLeaveGroup(); break;
        case 'setEquilibrerMode': setEquilibrerMode(id); break;
        case 'createHousehold': createHousehold(); break;
        case 'toggleAddMemberForm': toggleAddMemberForm(); break;
        case 'submitAddMember': submitAddMember(); break;
        default: break;
      }
    };

    root.oninput = function (e) {
      var el = e.target;
      var bind = el.getAttribute('data-bind');
      if (!bind) return;
      var id = el.getAttribute('data-id');
      var v = el.value;
      switch (bind) {
        case 'loginEmail': setLoginEmail(v); break;
        case 'loginPassword': setLoginPassword(v); break;
        case 'loginName': setLoginName(v); break;
        case 'newPassword': setNewPassword(v); break;
        case 'expenseLabel': setLabel(v); break;
        case 'expenseAmount': setAmount(v); break;
        case 'expenseDate': setDate(v); break;
        case 'paidExternal': setPaidExternal(v); break;
        case 'groupName': setGroupName(v); break;
        case 'settleAmount': setSettleAmount(v); break;
        case 'expensesSearch': setExpensesSearch(v); break;
        case 'inviteeName': setInviteeName(parseInt(id, 10), v); break;
        case 'inviteeEmail': setInviteeEmail(parseInt(id, 10), v); break;
        case 'inviteeShare': setInviteeShare(parseInt(id, 10), v); break;
        case 'newHouseholdName': setNewHouseholdName(v); break;
        case 'addMemberName': setAddMemberName(v); break;
        case 'addMemberEmail': setAddMemberEmail(v); break;
        case 'addMemberWeight': setAddMemberWeight(v); break;
        default: break;
      }
    };

    root.onchange = function (e) {
      var el = e.target;
      var bind = el.getAttribute('data-bind-change');
      if (!bind) return;
      var id = el.getAttribute('data-id');
      if (bind === 'receiptFile') { setReceiptFile(el.files && el.files[0] ? el.files[0] : null); return; }
      switch (bind) {
        case 'override': setOverride(id, el.value); break;
        case 'shareWeight': setShareWeight(id, el.value); break;
        case 'guardian': setGuardian(id, el.value); break;
        case 'household': setMemberHousehold(id, el.value); break;
        case 'addMemberGuardian': setAddMemberGuardian(el.value); break;
        default: break;
      }
    };
  }

  // ---------- Démarrage ----------

  document.addEventListener('DOMContentLoaded', function () {
    render();
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') {
        setState({ passwordRecovery: true, loginError: null, newPasswordForm: { password: '' } });
        return;
      }
      if (session) {
        var alreadyLoaded = state.loggedIn && state.currentUserId === session.user.id;
        setStateSilent({ loggedIn: true, currentUserId: session.user.id, loginError: null });
        if (!alreadyLoaded) {
          setStateSilent({ dataLoading: true });
          render();
          loadAppData();
        }
      } else {
        var theme = state.theme;
        state = Object.assign({}, defaultState(), { theme: theme });
        render();
      }
    });
  });
}());
