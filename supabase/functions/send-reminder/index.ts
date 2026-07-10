// Rohy — send-reminder Edge Function
//
// Enregistre un rappel de paiement (table `reminders`, comme le faisait déjà
// directement le client) et envoie en plus un vrai e-mail au destinataire
// s'il a un compte avec une adresse connue (`profiles.email`) — via un
// service d'e-mail transactionnel (Resend par défaut).
//
// Le montant et le message sont calculés côté client (le moteur de calcul
// `scripts/calc.js` n'est volontairement pas dupliqué côté serveur, cf.
// README racine) : cette fonction ne fait donc que vérifier que l'appelant
// est bien authentifié et partage un groupe avec le destinataire (même
// contrôle que la policy RLS `profiles_select` / `reminders_insert`),
// avant d'enregistrer le rappel et de tenter l'envoi d'e-mail.
//
// Déploiement : `supabase functions deploy send-reminder`
// Secret optionnel : `supabase secrets set RESEND_API_KEY=...` — sans clé,
// le rappel est quand même enregistré dans l'app, l'e-mail est simplement
// sauté (comportement inchangé par rapport à avant cette fonction).
// Appel côté client : supabase.functions.invoke('send-reminder', { body: {...} })

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('REMINDER_EMAIL_FROM') || 'Rohy <onboarding@resend.dev>';

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

    const { toUserId, amount, message } = await req.json();
    if (!toUserId || amount == null || !message) {
      return jsonResponse({ error: 'toUserId, amount et message sont requis.' }, 400);
    }

    // Client "utilisateur" : respecte les RLS, sert à identifier l'appelant
    // et à vérifier qu'il partage bien un groupe avec le destinataire —
    // même garde-fou que la policy RLS "profiles_select"/"reminders_insert",
    // pour ne pas pouvoir déclencher un e-mail vers quelqu'un avec qui on
    // n'a aucun lien dans l'app.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'session invalide.' }, 401);

    if (user.id === toUserId) return jsonResponse({ error: 'impossible de t\'envoyer un rappel à toi-même.' }, 400);

    const { data: shares, error: sharesError } = await callerClient.rpc('shares_group_with', { target: toUserId });
    if (sharesError) return jsonResponse({ error: sharesError.message }, 500);
    if (!shares) return jsonResponse({ error: 'aucun groupe en commun avec ce destinataire.' }, 403);

    // Client "service role" : contourne les RLS pour lire l'e-mail du
    // destinataire (non chargé côté client) et enregistrer le rappel.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: recipient, error: recipientError } = await adminClient
      .from('profiles')
      .select('id, name, email')
      .eq('id', toUserId)
      .single();
    if (recipientError || !recipient) return jsonResponse({ error: 'destinataire introuvable.' }, 404);

    const { data: reminder, error: insertError } = await adminClient
      .from('reminders')
      .insert({ from_user: user.id, to_user: toUserId, amount, message })
      .select()
      .single();
    if (insertError) return jsonResponse({ error: insertError.message }, 500);

    if (!recipient.email) {
      return jsonResponse({ ok: true, reminder, emailSent: false, emailSkippedReason: 'no_email' });
    }
    if (!RESEND_API_KEY) {
      return jsonResponse({ ok: true, reminder, emailSent: false, emailSkippedReason: 'not_configured' });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: recipient.email,
        subject: 'Rappel de remboursement — Rohy',
        text: message,
      }),
    });
    if (!emailRes.ok) {
      const emailErrorText = await emailRes.text();
      return jsonResponse({ ok: true, reminder, emailSent: false, emailError: emailErrorText });
    }

    return jsonResponse({ ok: true, reminder, emailSent: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'erreur inconnue.' }, 500);
  }
});
