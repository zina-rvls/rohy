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
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (err) { return 'dark'; }
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
      currentUserId: null,
      showAccount: false,
      showManageMembers: false,
      manageMembersGroupId: null,
      showConfirmDeleteGroup: false,
      confirmDeleteGroupId: null,
      selectedGroupId: null,
      selectedPersonId: null,
      people: [],
      groups: [],
      expenses: [],
      payments: [],
      reminders: [],
      toast: null,
      showAddExpense: false,
      showAddGroup: false,
      showSettle: false,
      form: { label: '', amount: '', groupId: null, paidBy: null, participantIds: [], overrides: {} },
      groupForm: { name: '', currency: seed.CURRENCIES[0].code, invitees: [{ name: '', email: '', sharePercent: '100' }] },
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
  // README). Chaque groupe a sa propre devise pour son propre affichage.
  function currencySymbol() { return '€'; }
  function currencySymbolFor(code) {
    var c = seed.CURRENCIES.find(function (x) { return x.code === code; });
    return c ? c.symbol : currencySymbol();
  }
  function fmt(n) { return fmtIn(n, null); }
  function fmtIn(n, currencyCode) {
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(n).toFixed(2).replace('.', ',');
    return sign + v + ' ' + (currencyCode ? currencySymbolFor(currencyCode) : currencySymbol());
  }
  function initials(name) { return name.slice(0, 2).toUpperCase(); }
  function colorForBalance(n) { return calc.colorForBalance(n); }
  function hasReducedShare(p) { return p.sharePercent != null && p.sharePercent !== 100; }
  function shareBadge(p, inline) {
    if (!hasReducedShare(p)) return '';
    return '<span class="badge-child' + (inline ? ' inline' : '') + '">part ' + p.sharePercent + '%</span>';
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
    toastTimer = setTimeout(function () {
      setState(function (s) { return s.toast === msg ? { toast: null } : {}; });
    }, 2600);
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
    ]).then(function (results) {
      var err = firstErrorOf(results);
      if (err) throw err;
      var profileRows = results[0].data, groupRows = results[1].data, memberRows = results[2].data,
        expenseRows = results[3].data, participantRows = results[4].data, paymentRows = results[5].data,
        reminderRows = results[6].data;

      var people = profileRows.map(function (p) {
        return { id: p.id, name: p.name, color: p.color, sharePercent: p.share_percent, defaultCoveredBy: p.default_covered_by || undefined };
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
        };
      });
      var payments = paymentRows.map(function (p) {
        return { id: p.id, from: p.from_user, to: p.to_user, amount: Number(p.amount), date: p.payment_date, groupId: p.group_id };
      });
      var reminders = reminderRows.map(function (r) {
        return { id: r.id, toPersonId: r.to_user, amount: Number(r.amount), date: r.reminder_date, message: r.message };
      });

      setState({ people: people, groups: groups, expenses: expenses, payments: payments, reminders: reminders, dataLoading: false });
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
  function openGroup(id) { navigate('groupDetail', { selectedGroupId: id }); }
  function openPerson(id) { navigate('person', { selectedPersonId: id }); }
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
  function backToLoginForm() { setState({ magicSent: false, loginError: null }); }
  function setLoginEmail(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { email: v }), loginError: null }; }); }
  function setLoginPassword(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { password: v }), loginError: null }; }); }
  function setLoginName(v) { setStateSilent(function (s) { return { loginForm: Object.assign({}, s.loginForm, { name: v }), loginError: null }; }); }

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

  function logout() {
    setState({ showAccount: false });
    sb.auth.signOut();
    // onAuthStateChange (SIGNED_OUT) réinitialise l'état et affiche l'écran de connexion.
  }

  // ---------- Reminders / settle ----------
  function sendReminder(personId) {
    var p = person(personId);
    var rel = pairNet(state.currentUserId, personId);
    var amt = rel < 0 ? -rel : 0;
    var msg = 'petit rappel à ' + p.name + ' — psst, tu me dois encore ' + fmt(amt);
    sb.from('reminders').insert({ from_user: state.currentUserId, to_user: personId, amount: amt, message: msg }).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData().then(function () { showToast('rappel envoyé à ' + p.name); });
    });
  }
  function openSettle(personId) {
    var me = state.currentUserId;
    var bal = pairNet(me, personId);
    var from = bal < 0 ? personId : me;
    var to = bal < 0 ? me : personId;
    setState({ showSettle: true, settleForm: { from: from, to: to, amount: Math.abs(bal).toFixed(2).replace('.', ',') } });
  }
  function setSettleAmount(v) { setStateSilent(function (s) { return { settleForm: Object.assign({}, s.settleForm, { amount: v }) }; }); }
  function submitSettle() {
    var sf = state.settleForm;
    var amt = parseFloat((sf.amount || '').replace(',', '.'));
    if (!amt || amt <= 0) return;
    sb.from('payments').insert({ from_user: sf.from, to_user: sf.to, amount: amt, group_id: null }).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      setState({ showSettle: false });
      loadAppData().then(function () { showToast('paiement enregistré'); });
    });
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
      form: { editingId: null, label: '', amount: '', date: new Date().toISOString().slice(0, 10), groupId: g.id, paidBy: state.currentUserId, participantIds: g.memberIds.slice(), overrides: overrides, fullyPaid: true, paidExternal: '' },
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
        editingId: e.id, label: e.label, amount: String(e.amount).replace('.', ','), date: e.date, groupId: e.groupId, paidBy: e.paidBy,
        participantIds: e.participants.slice(), overrides: Object.assign({}, e.overrides || {}),
        fullyPaid: fullyPaid, paidExternal: fullyPaid ? '' : String(e.paidExternal != null ? e.paidExternal : 0).replace('.', ','),
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
        group_id: f.groupId, label: f.label.trim(), amount: amt, paid_external: paidExternal, expense_date: f.date, paid_by: f.paidBy,
      }).eq('id', f.editingId).then(function (res) {
        if (res.error) { setState({ formError: res.error.message }); return; }
        sb.from('expense_participants').delete().eq('expense_id', f.editingId).then(function () {
          sb.from('expense_participants').insert(participantRowsFor(f.editingId)).then(function (insRes) {
            if (insRes.error) { showToast('erreur : ' + insRes.error.message); return; }
            setState({ showAddExpense: false });
            loadAppData().then(function () { showToast('dépense modifiée'); });
          });
        });
      });
      return;
    }

    sb.from('expenses').insert({
      group_id: f.groupId, label: f.label.trim(), icon: 'ph-bold ph-receipt', amount: amt, paid_external: paidExternal, paid_by: f.paidBy, expense_date: f.date,
    }).select().single().then(function (res) {
      if (res.error) { setState({ formError: res.error.message }); return; }
      sb.from('expense_participants').insert(participantRowsFor(res.data.id)).then(function (insRes) {
        if (insRes.error) { showToast('erreur : ' + insRes.error.message); return; }
        setState({ showAddExpense: false });
        loadAppData().then(function () { showToast('dépense ajoutée à ' + g.name); });
      });
    });
  }

  // ---------- Groups ----------
  var INVITEE_COLORS = ['#4ADE80', '#F97362', '#9B81FF', '#29B876', '#F4D35E', '#5B9CF6', '#E88AC4'];

  function openAddGroup() {
    setState({
      showAddGroup: true,
      formError: null,
      groupForm: { name: '', currency: seed.CURRENCIES[0].code, invitees: [{ name: '', email: '', sharePercent: '100' }] },
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
  function setInviteeShare(index, v) { updateInvitee(index, 'sharePercent', v, true); }
  function addInviteeRow() {
    setState(function (s) { return { groupForm: Object.assign({}, s.groupForm, { invitees: s.groupForm.invitees.concat([{ name: '', email: '', sharePercent: '100' }]) }) }; });
  }
  function removeInviteeRow(index) {
    setState(function (s) {
      var invitees = s.groupForm.invitees.filter(function (_, i) { return i !== index; });
      if (invitees.length === 0) invitees = [{ name: '', email: '', sharePercent: '100' }];
      return { groupForm: Object.assign({}, s.groupForm, { invitees: invitees }) };
    });
  }
  function submitGroup() {
    var gf = state.groupForm;
    if (!gf.name.trim()) { setState({ formError: 'donne un nom au groupe.' }); return; }
    var validInvitees = gf.invitees.filter(function (inv) { return inv.name.trim() || inv.email.trim(); });
    for (var i = 0; i < validInvitees.length; i++) {
      var inv = validInvitees[i];
      if (!inv.name.trim()) { setState({ formError: 'donne un prénom à chaque membre invité.' }); return; }
      if (!inv.email.trim() || inv.email.indexOf('@') === -1) { setState({ formError: 'entre un e-mail valide pour ' + inv.name.trim() + '.' }); return; }
    }
    setState({ formError: null });

    sb.from('groups').insert({ name: gf.name.trim(), currency: gf.currency, admin_id: state.currentUserId }).select().single().then(function (res) {
      if (res.error) { setState({ formError: res.error.message }); return; }
      var newGroup = res.data;
      sb.from('group_members').insert({ group_id: newGroup.id, user_id: state.currentUserId }).then(function (memRes) {
        if (memRes.error) { setState({ formError: memRes.error.message }); return; }

        var invitePromises = validInvitees.map(function (invitee, idx) {
          return sb.functions.invoke('invite-member', {
            body: {
              groupId: newGroup.id, name: invitee.name.trim(), email: invitee.email.trim(),
              sharePercent: invitee.sharePercent, color: INVITEE_COLORS[idx % INVITEE_COLORS.length],
            },
          }).then(function (inviteRes) {
            return (inviteRes.error || (inviteRes.data && inviteRes.data.error)) ? invitee.name.trim() : null;
          }).catch(function () { return invitee.name.trim(); });
        });

        Promise.all(invitePromises).then(function (results) {
          var failedInvites = results.filter(function (name) { return name; });
          setState({ showAddGroup: false });
          loadAppData().then(function () {
            if (failedInvites.length) showToast('groupe créé — invitation impossible pour : ' + failedInvites.join(', '));
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
  function toggleManageMember(groupId, personId) {
    var g = group(groupId);
    if (personId === g.adminId) return;
    var has = g.memberIds.indexOf(personId) !== -1;
    var query = has
      ? sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', personId)
      : sb.from('group_members').insert({ group_id: groupId, user_id: personId });
    query.then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData();
    });
  }
  function setSharePercent(personId, value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return;
    n = Math.max(0, Math.min(100, n));
    sb.from('profiles').update({ share_percent: n }).eq('id', personId).then(function (res) {
      if (res.error) { showToast('erreur : ' + res.error.message); return; }
      loadAppData();
    });
  }

  // ---------- Modales ----------
  function openAccount() { setState({ showAccount: true }); }
  function closeModal() {
    setState({
      showAddExpense: false, showAddGroup: false, showSettle: false, showAccount: false, showManageMembers: false,
      showConfirmDeleteGroup: false, confirmDeleteGroupId: null, formError: null,
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

  function render() {
    var root = document.getElementById('app');
    var focusInfo = captureFocus(root);
    root.setAttribute('data-theme', state.theme);
    if (!state.loggedIn) {
      root.innerHTML = renderLogin();
    } else if (state.dataLoading || !person(state.currentUserId)) {
      root.innerHTML = renderLoadingScreen();
    } else {
      root.innerHTML = renderApp();
    }
    bindEvents(root);
    restoreFocus(root, focusInfo);
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
        '<div class="divider-or">ou</div>' +
        '<div class="link-center" data-action="toggleLoginMode">se connecter sans mot de passe →</div>' +
        '<div class="link-center" style="margin-top:12px" data-action="showSignup">pas encore de compte ? en créer un →</div>';
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
        shareBadge(p, false) +
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
      '<button class="current-user-row pressable" data-action="openAccount">' +
      '<div class="avatar avatar-26" style="background:' + cu.color + '">' + initials(cu.name) + '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">connecté en tant que <b style="color:var(--text-primary);font-weight:700">' + escapeHtml(cu.name) + '</b></div>' +
      '<i class="ph-bold ph-caret-down" style="font-size:11px;color:var(--text-tertiary)"></i>' +
      '</button>' +
      (otherPeople.length === 0 ?
        '<div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px">Crée un groupe et invite des amis pour commencer à suivre vos dépenses.</div>' :
        '<div class="balance-card">' +
        '<div class="balance-label">solde net total</div>' +
        '<div class="balance-amount" style="color:' + colorForBalance(sum) + '">' + (sum >= 0 ? '+' : '-') + fmt(Math.abs(sum)).replace('-', '') + '</div>' +
        '<div class="balance-detail-row"><div class="owed">on te doit ' + fmt(owed).replace('-', '') + '</div><div class="owe">tu dois ' + fmt(owe).replace('-', '') + '</div></div>' +
        '</div>') +
      (pendingShare > 0.5 ?
        '<div class="warning-banner"><div class="warning-banner-title"><i class="ph-bold ph-clock-countdown"></i> à anticiper</div>' +
        '<div class="warning-banner-body">Un acompte n\'est pas encore payé en totalité. Ta part : ' + fmt(pendingShare) + '.</div></div>' : '') +
      (otherPeople.length > 0 ? '<div class="section-label">par personne</div>' + rows : '')
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
      var balLabel = covered ? '→ ' + covered.name : (Math.abs(bal) < 0.5 ? '0,00' : fmtIn(bal, g.currency));
      var balColor = covered ? 'var(--status-neutral)' : colorForBalance(bal);
      return (
        '<div class="member-row">' +
        '<div class="avatar avatar-30" style="background:' + p.color + '">' + initials(p.name) + '</div>' +
        '<div class="col-name">' + escapeHtml(p.name) + shareBadge(p, true) + '</div>' +
        '<div class="col-num">' + fmtIn(paid, g.currency) + '</div>' +
        '<div class="col-num">' + fmtIn(share, g.currency) + '</div>' +
        '<div class="col-bal" style="color:' + balColor + '">' + escapeHtml(balLabel) + '</div>' +
        '</div>'
      );
    }).join('');

    var txns = calc.simplify(debts, g.memberIds);
    var suggestions = txns.map(function (t) {
      return '<div class="suggestion-row"><div><b>' + escapeHtml(person(t.from).name) + '</b> → <b>' + escapeHtml(person(t.to).name) + '</b></div>' +
        '<div class="suggestion-amount">' + fmtIn(t.amount, g.currency) + '</div></div>';
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
          '</div><div class="expense-amount">' + fmtIn(e.amount, g.currency) + '</div></div>'
        );
      }).join('');

    return (
      '<div class="member-table"><div class="section-label">payé / part / solde</div>' + memberRows + '</div>' +
      (isAdmin ?
        '<div class="admin-actions">' +
        '<button class="btn-outline pressable" data-action="openManageMembers" data-id="' + g.id + '"><i class="ph-bold ph-users-three"></i> gérer les membres</button>' +
        '<button class="btn-icon-danger pressable" data-action="openConfirmDeleteGroup" data-id="' + g.id + '"><i class="ph-bold ph-trash"></i></button>' +
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
      (hasReducedShare(p) ? '<div style="margin-top:8px">' + shareBadge(p, false) + '</div>' : '') +
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
      var cur = g && g.currency;
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
      items.push({ date: e.date, icon: e.icon, iconBg: 'var(--surface-overlay)', iconColor: 'var(--text-secondary)', text: escapeHtml(person(e.paidBy).name) + ' a payé « ' + escapeHtml(e.label) + ' »' + (g ? ' · ' + escapeHtml(g.name) : ''), amountLabel: fmtIn(e.amount, g && g.currency), color: 'var(--text-primary)' });
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
    if (state.showAccount) out += renderAccountModal();
    if (state.showManageMembers) out += renderManageMembersModal();
    if (state.showConfirmDeleteGroup) out += renderConfirmDeleteGroupModal();
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
        '<span style="font-size:12.5px;color:var(--text-secondary)">part de contribution</span>' +
        '<input class="child-percent-input" data-bind="inviteeShare" data-id="' + i + '" value="' + escapeHtml(inv.sharePercent) + '" inputmode="numeric" />' +
        '<span style="font-size:11px;color:var(--text-tertiary)">%</span>' +
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
      '<button class="btn-primary pressable" style="margin-top:14px" data-action="submitGroup">créer le groupe</button>' +
      (state.formError ? '<div class="form-error">' + escapeHtml(state.formError) + '</div>' : '') +
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
    var rows = state.people.map(function (p) {
      var checked = mg.memberIds.indexOf(p.id) !== -1;
      var isAdmin = p.id === mg.adminId;
      return (
        '<div class="checkbox-row">' +
        '<div class="checkbox' + (checked ? ' checked' : '') + '" data-action="toggleManageMember" data-group-id="' + mg.id + '" data-id="' + p.id + '">' + (checked ? '<i class="ph-bold ph-check"></i>' : '') + '</div>' +
        '<div style="flex:1;font-size:14px;color:var(--text-primary);font-weight:600">' + escapeHtml(p.name) + (isAdmin ? ' (admin)' : '') + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
        '<input class="child-percent-input" data-bind-change="sharePercent" data-id="' + p.id + '" value="' + (p.sharePercent != null ? p.sharePercent : 100) + '" inputmode="numeric" />' +
        '<span style="font-size:11px;color:var(--text-tertiary)">%</span></div>' +
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
        case 'openAccount': openAccount(); break;
        case 'logout': logout(); break;
        case 'openAddExpenseGlobal': openAddExpense(state.groups[0] && state.groups[0].id); break;
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
        case 'backToLoginForm': backToLoginForm(); break;
        case 'submitLogin': submitLogin(); break;
        case 'submitSignup': submitSignup(); break;
        case 'submitMagicLink': submitMagicLink(); break;
        case 'selectGroupForForm': selectGroupForForm(id); break;
        case 'selectPayer': selectPayer(id); break;
        case 'toggleParticipant': toggleParticipant(id); break;
        case 'toggleFullyPaid': toggleFullyPaid(); break;
        case 'submitExpense': submitExpense(); break;
        case 'deleteExpense': deleteExpense(); break;
        case 'setGroupCurrency': setGroupCurrency(id); break;
        case 'addInviteeRow': addInviteeRow(); break;
        case 'removeInviteeRow': removeInviteeRow(parseInt(id, 10)); break;
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
      var id = el.getAttribute('data-id');
      var v = el.value;
      switch (bind) {
        case 'loginEmail': setLoginEmail(v); break;
        case 'loginPassword': setLoginPassword(v); break;
        case 'loginName': setLoginName(v); break;
        case 'expenseLabel': setLabel(v); break;
        case 'expenseAmount': setAmount(v); break;
        case 'expenseDate': setDate(v); break;
        case 'paidExternal': setPaidExternal(v); break;
        case 'groupName': setGroupName(v); break;
        case 'settleAmount': setSettleAmount(v); break;
        case 'inviteeName': setInviteeName(parseInt(id, 10), v); break;
        case 'inviteeEmail': setInviteeEmail(parseInt(id, 10), v); break;
        case 'inviteeShare': setInviteeShare(parseInt(id, 10), v); break;
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
        case 'sharePercent': setSharePercent(id, el.value); break;
        default: break;
      }
    };
  }

  // ---------- Démarrage ----------

  document.addEventListener('DOMContentLoaded', function () {
    render();
    sb.auth.onAuthStateChange(function (event, session) {
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
