// kotikota — invite-member Edge Function
//
// Invite quelqu'un à rejoindre un groupe par e-mail : crée son compte
// (auth.users, via la clé service role — jamais exposée au client), envoie
// l'e-mail d'invitation Supabase, puis l'ajoute au groupe. Le trigger
// `handle_new_user` (cf. migrations/0001_init.sql) crée automatiquement son
// profil avec le nom et la part de contribution fournis.
//
// Déploiement : `supabase functions deploy invite-member`
// Appel côté client : supabase.functions.invoke('invite-member', { body: {...} })
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

    const { groupId, name, email, sharePercent, color } = await req.json();
    if (!groupId || !name || !email) {
      return jsonResponse({ error: 'groupId, name et email sont requis.' }, 400);
    }
    if (!String(email).includes('@')) {
      return jsonResponse({ error: 'e-mail invalide.' }, 400);
    }
    const pct = Math.max(0, Math.min(100, parseInt(sharePercent, 10) || 100));

    // Client "utilisateur" : respecte les RLS, sert à vérifier que l'appelant
    // est bien admin de ce groupe avant toute action privilégiée.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc('is_group_admin', { gid: groupId });
    if (adminCheckError) return jsonResponse({ error: adminCheckError.message }, 500);
    if (!isAdmin) return jsonResponse({ error: "seul l'admin du groupe peut inviter des membres." }, 403);

    // Client "service role" : contourne les RLS pour les actions admin
    // (créer le compte invité, l'ajouter au groupe).
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, share_percent: pct, color: color || '#7C5CFF' },
    });

    let invitedUserId: string;
    if (inviteError) {
      // Cas fréquent : cette personne a déjà un compte (invitée dans un
      // autre groupe auparavant) — on la retrouve par e-mail et on l'ajoute
      // simplement au nouveau groupe plutôt que d'échouer.
      const alreadyExists = /already registered|already exists/i.test(inviteError.message);
      if (!alreadyExists) return jsonResponse({ error: inviteError.message }, 400);
      const { data: existingProfile, error: lookupError } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (lookupError || !existingProfile) {
        return jsonResponse({ error: "cette adresse a déjà un compte, mais son profil est introuvable." }, 409);
      }
      invitedUserId = existingProfile.id;
    } else {
      invitedUserId = invited.user.id;
    }

    const { error: memberError } = await adminClient
      .from('group_members')
      .upsert({ group_id: groupId, user_id: invitedUserId }, { onConflict: 'group_id,user_id' });
    if (memberError) return jsonResponse({ error: memberError.message }, 500);

    return jsonResponse({ ok: true, userId: invitedUserId });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'erreur inconnue.' }, 500);
  }
});
