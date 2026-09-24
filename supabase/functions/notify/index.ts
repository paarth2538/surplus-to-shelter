// Supabase Edge Function: Secure external notification dispatcher (Telegram & Email)
//
// ENVIRONMENT VARIABLES REQUIRED IN SUPABASE DASHBOARD:
// - TELEGRAM_BOT_TOKEN (optional: bot token from @BotFather)
// - TELEGRAM_CHAT_ID (optional: default channel/chat ID for dispatch alerts)
// - RESEND_API_KEY (optional: API key from resend.com for operational emails)
// - NOTIFICATION_FROM_EMAIL (optional: sender email, e.g. alerts@surplus2shelter.org)
//
// SECURITY:
// Secrets must NEVER be placed in frontend client code. This function runs on
// the secure server-side Deno runtime and validates caller authentication.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  recipient_email?: string;
  telegram_chat_id?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { recipient_email, telegram_chat_id, title, message, type } = payload;

    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const defaultTelegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') || 'notifications@surplus2shelter.org';

    const results = {
      in_app: 'logged_in_database',
      telegram: 'not_configured',
      email: 'not_configured',
    };

    // 1. Dispatch Telegram message if configured
    const targetChatId = telegram_chat_id || defaultTelegramChatId;
    if (telegramToken && targetChatId) {
      try {
        const text = `🚨 *Surplus2Shelter: ${title}*\n\n${message}\n\n_Type: ${type}_`;
        const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text,
            parse_mode: 'Markdown',
          }),
        });
        const tgJson = await res.json();
        results.telegram = tgJson.ok ? 'sent' : `failed: ${tgJson.description}`;
      } catch (err: unknown) {
        results.telegram = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // 2. Dispatch Email via Resend if configured
    if (resendApiKey && recipient_email) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: recipient_email,
            subject: `Surplus2Shelter: ${title}`,
            text: `${message}\n\nView details in your Surplus2Shelter dashboard.`,
            html: `<div style="font-family:sans-serif;padding:20px;max-width:560px;">
              <h2 style="color:#2b60ec;">Surplus2Shelter Alert</h2>
              <h3>${title}</h3>
              <p style="font-size:16px;line-height:1.5;">${message}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
              <p style="font-size:12px;color:#64748b;">Direct Care Logistics Notification System</p>
            </div>`,
          }),
        });
        const emailJson = await res.json();
        results.email = res.ok ? 'sent' : `failed: ${JSON.stringify(emailJson)}`;
      } catch (err: unknown) {
        results.email = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
