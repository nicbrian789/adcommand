/** Shared secret detection / redaction for AI Assisten (no I/O). */

const SECRET_PATTERN =
  /sk-[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY|Bearer\s+[A-Za-z0-9._\-]{20,}|(?:api[_-]?key|api[_-]?token|access[_-]?token)\s*[:=]\s*\S{12,}/i;

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERN.test(text);
}

/** Replace likely secret substrings so alert/error text is safer in LLM prompts. */
export function redactSecrets(text: string, maxLen = 240): string {
  let out = text
    .replace(/sk-[a-zA-Z0-9]{20,}/gi, "[REDACTED_KEY]")
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[REDACTED_JWT]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]{20,}/gi, "Bearer [REDACTED]")
    .replace(/BEGIN (RSA |OPENSSH )?PRIVATE KEY[\s\S]*?END (RSA |OPENSSH )?PRIVATE KEY/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/(?:api[_-]?key|api[_-]?token|access[_-]?token)\s*[:=]\s*\S{12,}/gi, "[REDACTED_CRED]");

  out = out.replace(/\s+/g, " ").trim();
  if (out.length > maxLen) out = `${out.slice(0, maxLen - 1)}…`;
  return out;
}

export function safeClientError(err: unknown, fallback = "Gagal memanggil AI Assisten."): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message || fallback;
  if (looksLikeSecret(msg)) return fallback;
  // Keep short, known operational messages; truncate anything else.
  if (
    /belum dikonfigurasi|Sesi kamu|Pesan kosong|terlalu banyak|bukan JSON|Panggilan AI gagal|Respons AI kosong|Belum ada workspace|Jangan tempel/i.test(
      msg
    )
  ) {
    return redactSecrets(msg, 180);
  }
  return fallback;
}
