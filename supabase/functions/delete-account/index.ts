// Rohy — delete-account Edge Function
//
// Droit à l'effacement (RGPD) : supprime le compte de la personne appelante
// (jamais un autre profil — l'identité vient du JWT, jamais d'un id transmis
// par le client). Ne supprime PAS la ligne `profiles` elle-même : les
// dépenses/soldes/participants d'un groupe partagé y font référence sans
// cascade (paid_by, from_user/to_user, admin_id...), et un hard delete
// casserait l'historique des AUTRES membres. Le profil est anonymisé (nom,
// e-mail, lien vers le compte auth) et le vrai compte auth.users est
// supprimé (connexion impossible ensuite, quel que soit le mode :
// mot de passe, lien magique...).
//
// Chaque groupe où la personne est membre est quitté (comme "quitter ce
// groupe", cf. scripts/app.js confirmLeaveGroup) : si elle en est admin et
// qu'il reste d'autres membres, l'administration est transférée au membre
// présent depuis le plus longtemps ; si elle est seule dans le groupe, le
// groupe entier est supprimé plutôt que laissé sans admin valide.
//
// Un solde non réglé n'empêche pas la suppression : il reste affiché
// (marqué « Compte supprimé », même mécanique que pour un membre ayant
// quitté un groupe) tant qu'il n'est pas soldé par les autres membres —
// supprimer son compte retire l'accès et les infos personnelles, pas la
// dette elle-même.
//
// Déploiement : `supabase functions deploy delete-account`
// Appel côté client : supabase.functions.invoke('delete-account', {})
// (le JWT de l'utilisateur connecté est transmis automatiquement par supabase-js)

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'non authentifié.' }, 401);

    // Client "utilisateur" : uniquement pour identifier l'appelant via son
    // propre JWT — jamais un id fourni par le corps de la requête.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: 'session invalide.' }, 401);
    const authUserId = userData.user.id;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profileError) return jsonResponse({ error: profileError.message }, 500);
    if (!profile) return jsonResponse({ error: 'profil introuvable.' }, 404);
    const profileId = profile.id;

    const { data: memberships, error: membershipsError } = await adminClient
      .from('group_members')
      .select('group_id')
      .eq('user_id', profileId);
    if (membershipsError) return jsonResponse({ error: membershipsError.message }, 500);

    for (const m of memberships || []) {
      const { data: g, error: gError } = await adminClient
        .from('groups')
        .select('admin_id')
        .eq('id', m.group_id)
        .maybeSingle();
      if (gError) return jsonResponse({ error: gError.message }, 500);
      if (!g) continue;

      if (g.admin_id === profileId) {
        const { data: others, error: othersError } = await adminClient
          .from('group_members')
          .select('user_id, joined_at')
          .eq('group_id', m.group_id)
          .neq('user_id', profileId)
          .order('joined_at', { ascending: true });
        if (othersError) return jsonResponse({ error: othersError.message }, 500);

        if (others && others.length > 0) {
          const { error: transferError } = await adminClient
            .from('groups')
            .update({ admin_id: others[0].user_id })
            .eq('id', m.group_id);
          if (transferError) return jsonResponse({ error: transferError.message }, 500);
          const { error: leaveError } = await adminClient
            .from('group_members')
            .delete()
            .eq('group_id', m.group_id)
            .eq('user_id', profileId);
          if (leaveError) return jsonResponse({ error: leaveError.message }, 500);
        } else {
          // Personne d'autre dans ce groupe : le supprimer entièrement
          // (cascade sur group_members/expenses/etc.) plutôt que de le
          // laisser sans admin valide.
          const { error: deleteGroupError } = await adminClient.from('groups').delete().eq('id', m.group_id);
          if (deleteGroupError) return jsonResponse({ error: deleteGroupError.message }, 500);
        }
      } else {
        const { error: leaveError } = await adminClient
          .from('group_members')
          .delete()
          .eq('group_id', m.group_id)
          .eq('user_id', profileId);
        if (leaveError) return jsonResponse({ error: leaveError.message }, 500);
      }
    }

    // Casse le lien auth_user_id AVANT de supprimer le compte auth : cette
    // colonne référence auth.users avec on delete cascade, donc la
    // supprimer maintenant évite que la ligne profiles elle-même ne soit
    // supprimée en cascade quand le compte auth disparaît juste après.
    const { error: anonError } = await adminClient
      .from('profiles')
      .update({ name: 'Compte supprimé', email: null, auth_user_id: null })
      .eq('id', profileId);
    if (anonError) return jsonResponse({ error: anonError.message }, 500);

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(authUserId);
    if (deleteAuthError) return jsonResponse({ error: deleteAuthError.message }, 500);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'erreur inconnue.' }, 500);
  }
});
