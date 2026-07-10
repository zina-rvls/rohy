/**
 * Rohy — client Supabase (P0 : vrai backend d'auth + base de données).
 * Chargé après le SDK supabase-js (CDN) et avant scripts/app.js.
 */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://qsoooqzsewpfstftiesq.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_tQ69FgXxrq6qzikZI5j8Yg_sGSf7HMd';
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}());
