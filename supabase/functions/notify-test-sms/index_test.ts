// supabase/functions/notify-test-sms/index_test.ts
// Deno unit tests for pure helper logic.
// Run: deno test supabase/functions/notify-test-sms/index_test.ts

import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

// ── helpers inlined for isolation (same logic as index.ts) ────────────────────

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

// ── tests ─────────────────────────────────────────────────────────────────────

Deno.test("maskPhone — standard PH number", () => {
  assertEquals(maskPhone("+639911234567"), "+63991***4567");
});

Deno.test("maskPhone — short number", () => {
  assertEquals(maskPhone("12345"), "***");
});

Deno.test("maskPhone — medium length", () => {
  assertEquals(maskPhone("09171234"), "091***34");
});

Deno.test("firstName — extracts first word", () => {
  assertEquals(firstName("Maria Clara De Los Santos"), "Maria");
});

Deno.test("firstName — empty string falls back", () => {
  assertEquals(firstName(""), "Student");
});

Deno.test("buildText — entry contains first name and 'entered'", () => {
  const text = buildText("Maria Clara", "entry", "2026-09-29T07:00:00Z");
  assertEquals(text.includes("Maria"), true);
  assertEquals(text.includes("entered"), true);
  assertEquals(text.includes("SRNHS TEST:"), true);
  assertEquals(text.includes("This is a system test."), true);
  // must NOT contain last name
  assertEquals(text.includes("Clara"), false);
});

Deno.test("buildText — exit contains 'exited'", () => {
  const text = buildText("Juan Dela Cruz", "exit", "2026-09-29T07:00:00Z");
  assertEquals(text.includes("exited"), true);
  assertEquals(text.includes("Juan"), true);
  assertEquals(text.includes("Dela"), false);
});

Deno.test("buildText — unknown event type defaults to 'entered'", () => {
  const text = buildText("Student", "classroom_checkin", "2026-09-29T07:00:00Z");
  assertEquals(text.includes("entered"), true);
});
