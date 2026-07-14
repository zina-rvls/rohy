// Rohy — join-group Edge Function
//
// Permet à quiconque connaît le lien d'un groupe (share_token, généré par
// l'admin depuis "Partager le lien d'invitation") de le rejoindre comme
// participant à part entière, sans jamais créer de compte e-mail/mot de
// passe — l'appelant doit déjà avoir une session (anonyme via
// signInAnonymously côté client, ou un vrai compte existant). Cette
// fonction contourne les RLS pour deux raisons : un non-membre ne peut ni
// lire le groupe (groups_select est réservé aux membres) ni s'ajouter
// lui-même à group_members (group_members_insert_admin est réservé à
// l'admin) — ce qui est le comportement voulu pour un accès direct, mais
// pas pour quelqu'un qui présente un lien valide.
//
// action "preview" : renvoie le nom/devise/nombre de membres du groupe sans
// rien modifier (affiche "Vous rejoignez tel groupe" avant confirmation) —
// fonctionne même sans utilisateur résolu (juste la clé anon).
// action "join" : ajoute réellement l'appelant au groupe, et renseigne son
// nom de profil s'il n'en a pas encore un "réel" (compte anonyme fraîchement
// créé, encore sur le repli "Invité").
//
// Déploiement : `supabase functions deploy join-group`
// Appel côté client : supabase.functions.invoke('join-group', { body: {...} })

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

    const { token, action, name } = await req.json();
    if (!token || !action) return jsonResponse({ error: 'token et action sont requis.' }, 400);

    // Client "service role" : contourne les RLS pour retrouver le groupe par
    // jeton (un non-membre ne peut normalement pas le lire) et, pour
    // "join", pour l'y ajouter.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: group, error: groupError } = await adminClient
      .from('groups')
      .select('id, name, currency')
      .eq('share_token', token)
      .maybeSingle();
    if (groupError) return jsonResponse({ error: groupError.message }, 500);
    if (!group) return jsonResponse({ error: "ce lien d'invitation n'est plus valide." }, 404);

    if (action === 'preview') {
      const { count } = await adminClient
        .from('group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', group.id);
      return jsonResponse({ ok: true, groupId: group.id, groupName: group.name, currency: group.currency, memberCount: count || 0 });
    }

    if (action !== 'join') return jsonResponse({ error: 'action inconnue.' }, 400);

    // Client "utilisateur" : identifie l'appelant (session anonyme fraîche,
    // ou compte réel déjà connecté) via son JWT.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'session invalide.' }, 401);

    const { error: memberError } = await adminClient
      .from('group_members')
      .upsert({ group_id: group.id, user_id: user.id }, { onConflict: 'group_id,user_id' });
    if (memberError) return jsonResponse({ error: memberError.message }, 500);

    // Ne renseigne le nom que si le profil n'en a pas encore un "réel" —
    // évite d'écraser le nom d'un compte existant qui rejoint via ce lien.
    if (name && String(name).trim()) {
      const { data: profile } = await adminClient.from('profiles').select('name').eq('id', user.id).maybeSingle();
      if (!profile || !profile.name || profile.name === 'Invité') {
        await adminClient.from('profiles').update({ name: String(name).trim() }).eq('id', user.id);
      }
    }

    return jsonResponse({ ok: true, groupId: group.id, groupName: group.name, currency: group.currency });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'erreur inconnue.' }, 500);
  }
});
