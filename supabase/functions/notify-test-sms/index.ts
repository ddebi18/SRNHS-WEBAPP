// supabase/functions/notify-test-sms/index.ts
// TEMPORARY test hook: fires on recognition_events INSERT (via DB Webhook),
// sends one test SMS per student/event-type/day through SMSGate.
// TO REMOVE: delete this file and the DB webhook in Supabase dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── helpers ──────────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length <= 6) return "***";
  if (p.length >= 11) return `${p.slice(0, 6)}***${p.slice(-4)}`;
  return `${p.slice(0, 3)}***${p.slice(-2)}`;
}

function firstName(fullName: string): string {
  return (fullName || "Student").trim().split(/\s+/)[0];
}

function buildText(name: string, eventType: string, capturedAt: string): string {
  const t = new Date(capturedAt).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
  const action = eventType === "exit" ? "exited" : "entered";
  return `SRNHS TEST: ${firstName(name)} ${action} at ${t}. This is a system test.`;
}

// ── main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const CP = (n: number, msg: string) => console.log(`[CP${n}] ${msg}`);

  CP(1, `Webhook received — method=${req.method}`);

  // ── secret check ────────────────────────────────────────────────────────
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (webhookSecret) {
    const incoming = req.headers.get("x-webhook-secret") ?? "";
    if (incoming !== webhookSecret) {
      console.warn("[CP2] Auth FAILED — bad webhook secret");
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized" }), { status: 401 });
    }
  }
  CP(2, "Auth ok");

  // ── feature flag ────────────────────────────────────────────────────────
  const enabled = (Deno.env.get("SMS_TEST_HOOK_ENABLED") ?? "").toLowerCase();
  if (!["true", "1", "yes", "on"].includes(enabled)) {
    CP(3, "Hook disabled — returning 200");
    return new Response(JSON.stringify({ ok: true, reason: "disabled" }), { status: 200 });
  }

  // ── recipients allowlist ────────────────────────────────────────────────
  const recipientsRaw = Deno.env.get("TEST_RECIPIENTS") ?? "";
  const recipients = recipientsRaw.split(",").map(r => r.trim()).filter(Boolean);
  if (recipients.length === 0) {
    CP(3, "No TEST_RECIPIENTS — skipping");
    return new Response(JSON.stringify({ ok: true, reason: "no_recipients" }), { status: 200 });
  }

  // ── parse webhook payload ────────────────────────────────────────────────
  let record: Record<string, unknown>;
  try {
    const body = await req.json();
    // Supabase DB webhooks send { type, table, schema, record, old_record }
    record = (body.record ?? body) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "bad_json" }), { status: 400 });
  }

  const studentId = record.student_id as string | null;
  const eventType = record.event_type as string | null;
  const status = record.status as string | null;
  const capturedAt = (record.captured_at as string) || new Date().toISOString();

  // ── gate checks ─────────────────────────────────────────────────────────
  if (!studentId || !eventType) {
    CP(3, `Skipped — missing student_id or event_type`);
    return new Response(JSON.stringify({ ok: true, reason: "not_matched" }), { status: 200 });
  }
  if (status && status !== "matched") {
    CP(3, `Skipped — status=${status} (not matched)`);
    return new Response(JSON.stringify({ ok: true, reason: "not_matched" }), { status: 200 });
  }
  if (!["entry", "exit"].includes(eventType)) {
    CP(3, `Skipped — event_type=${eventType}`);
    return new Response(JSON.stringify({ ok: true, reason: "event_type_skipped" }), { status: 200 });
  }

  // ── supabase client (service role for dedup + log writes) ────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(supabaseUrl, serviceKey);

  // ── fetch student first name ─────────────────────────────────────────────
  let studentName = "Student";
  try {
    const { data } = await db
      .from("students")
      .select("first_name, last_name")
      .eq("id", studentId)
      .single();
    if (data) studentName = `${data.first_name} ${data.last_name}`;
  } catch { /* non-fatal */ }

  // ── dedup check (one row per student/event_type/UTC-day in sms_notifications) ──
  const dailyCap = parseInt(Deno.env.get("SMS_DAILY_CAP") ?? "30", 10);
  const cooldownSec = parseInt(Deno.env.get("SMS_COOLDOWN_SECONDS") ?? "600", 10);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: existingRows } = await db
    .from("sms_notifications")
    .select("id, sent_at")
    .eq("student_id", studentId)
    .eq("event_type", eventType)
    .eq("source", "notify-test-sms")
    .gte("sent_at", `${today}T00:00:00Z`)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (existingRows && existingRows.length > 0) {
    const lastSentSec = (Date.now() - new Date(existingRows[0].sent_at).getTime()) / 1000;
    if (lastSentSec < cooldownSec) {
      CP(3, `Dedup — cooldown active (${Math.round(cooldownSec - lastSentSec)}s remaining)`);
      return new Response(JSON.stringify({ ok: true, reason: "cooldown" }), { status: 200 });
    }
  }

  // ── daily cap check ──────────────────────────────────────────────────────
  const { count } = await db
    .from("sms_notifications")
    .select("id", { count: "exact", head: true })
    .eq("source", "notify-test-sms")
    .gte("sent_at", `${today}T00:00:00Z`);

  if ((count ?? 0) >= dailyCap) {
    CP(3, `Daily cap (${dailyCap}) reached — skipping`);
    return new Response(JSON.stringify({ ok: true, reason: "daily_cap" }), { status: 200 });
  }

  CP(3, `Gates passed — student=${studentId} event=${eventType}`);

  // ── build message ────────────────────────────────────────────────────────
  const msgText = buildText(studentName, eventType, capturedAt);

  // ── send via SMSGate ─────────────────────────────────────────────────────
  const baseUrl = (Deno.env.get("SMSGATE_BASE_URL") ?? "https://api.sms-gate.app/3rdparty/v1").replace(/\/$/, "");
  const sgUser = Deno.env.get("SMSGATE_USERNAME") ?? "";
  const sgPass = Deno.env.get("SMSGATE_PASSWORD") ?? "";
  const simNumber = Deno.env.get("SMSGATE_SIM_NUMBER");

  const payload: Record<string, unknown> = {
    textMessage: { text: msgText },
    phoneNumbers: recipients,
  };
  if (simNumber) payload.simNumber = parseInt(simNumber, 10);

  const authHeader = "Basic " + btoa(`${sgUser}:${sgPass}`);
  CP(4, `POST ${baseUrl}/messages — recipients=${recipients.map(maskPhone).join(",")} sim=${simNumber ?? "default"}`);

  let httpStatus = 0;
  let msgId = "";
  let errorMsg = "";
  let finalStatus = "failed";

  try {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    httpStatus = res.status;
    const responseText = await res.text();
    const truncated = responseText.slice(0, 200);
    CP(5, `Response status=${httpStatus} body=${truncated}`);

    if (res.ok) {
      try {
        const data = JSON.parse(responseText);
        msgId = data.id ?? data.messageId ?? "";
        finalStatus = data.state ?? data.status ?? "Pending";
      } catch {
        finalStatus = "Pending";
      }
    } else {
      errorMsg = responseText.slice(0, 200);
      finalStatus = "failed";
    }
  } catch (err: unknown) {
    errorMsg = String(err).slice(0, 200);
    CP(5, `Fetch error: ${errorMsg}`);
  }

  // ── log to sms_notifications ─────────────────────────────────────────────
  const logRows = recipients.map(r => ({
    student_id: studentId,
    guardian_phone: null,          // ponytail: never log guardian phone — this table was designed for it but we leave it null
    masked_phone: maskPhone(r),
    message: msgText,
    event_type: eventType,
    status: finalStatus,
    smsgate_msg_id: msgId || null,
    error_msg: errorMsg || null,
    source: "notify-test-sms",
    sent_at: new Date().toISOString(),
  }));

  await db.from("sms_notifications").insert(logRows);

  return new Response(
    JSON.stringify({ ok: finalStatus !== "failed", status: finalStatus, msgId, httpStatus }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
