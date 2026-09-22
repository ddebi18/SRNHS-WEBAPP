import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmsRequest {
  student_id: string;
  student_name?: string;
  guardian_phone: string;
  message: string;
  event_type: 'gate_entry' | 'gate_exit' | 'unexcused_absence' | 'tardiness' | 'general_alert';
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SmsRequest = await req.json();
    const { student_id, student_name, guardian_phone, message, event_type } = body;

    if (!guardian_phone || !message) {
      return new Response(
        JSON.stringify({ error: 'guardian_phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let status: 'sent' | 'failed' | 'queued' = 'queued';
    let providerUsed = 'mock';
    let providerResponse: any = null;

    // 1. Check Semaphore (Philippines primary)
    const semaphoreApiKey = Deno.env.get('SEMAPHORE_API_KEY');
    const semaphoreSender = Deno.env.get('SEMAPHORE_SENDER_NAME') || 'SEMAPHORE';

    // 2. Check PhilSms
    const philSmsToken = Deno.env.get('PHILSMS_API_TOKEN');

    // 3. Check Twilio
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

    // 4. Check Android SMS Gateway
    const androidGatewayUrl = Deno.env.get('ANDROID_GATEWAY_URL');
    const androidGatewayKey = Deno.env.get('ANDROID_GATEWAY_API_KEY');

    if (semaphoreApiKey) {
      providerUsed = 'semaphore';
      const cleanPhone = guardian_phone.replace(/^\+63/, '0').replace(/[^0-9]/g, '');
      const resp = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          apikey: semaphoreApiKey,
          number: cleanPhone,
          message: message,
          sender_name: semaphoreSender,
        }),
      });
      providerResponse = await resp.json();
      status = resp.ok ? 'sent' : 'failed';
    } else if (philSmsToken) {
      providerUsed = 'philsms';
      const resp = await fetch('https://app.philsms.com/api/v3/sms/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${philSmsToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          recipient: guardian_phone,
          sender_id: 'PhilSMS',
          type: 'plain',
          message: message,
        }),
      });
      providerResponse = await resp.json();
      status = resp.ok ? 'sent' : 'failed';
    } else if (twilioSid && twilioAuth && twilioFrom) {
      providerUsed = 'twilio';
      const authHeader = btoa(`${twilioSid}:${twilioAuth}`);
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: guardian_phone,
            From: twilioFrom,
            Body: message,
          }),
        }
      );
      providerResponse = await resp.json();
      status = resp.ok ? 'sent' : 'failed';
    } else if (androidGatewayUrl) {
      providerUsed = 'android_gateway';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (androidGatewayKey) headers['x-api-key'] = androidGatewayKey;

      const resp = await fetch(`${androidGatewayUrl}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: guardian_phone,
          message: message,
        }),
      });
      providerResponse = await resp.json().catch(() => ({}));
      status = resp.ok ? 'sent' : 'failed';
    } else {
      // Mock / Simulation mode when no API keys are set
      providerUsed = 'simulation';
      status = 'sent';
      providerResponse = { simulated: true, note: 'No external SMS provider configured. Simulating delivery.' };
    }

    // Persist to Supabase sms_notifications table if valid UUID student_id or fallback
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student_id);
    let recordId: string | null = null;

    if (isUUID) {
      const { data, error } = await supabase
        .from('sms_notifications')
        .insert({
          student_id,
          guardian_phone,
          message,
          event_type,
          status,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!error && data) {
        recordId = data.id;
      }
    }

    return new Response(
      JSON.stringify({
        success: status === 'sent',
        id: recordId,
        provider: providerUsed,
        status,
        response: providerResponse,
      }),
      {
        status: status === 'sent' ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
