import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeSecret, redactSecrets, safeClientError } from "./sanitize";
import { checkAiRateLimit, resetAiRateLimitForTests } from "./rateLimit";

describe("AI sanitize", () => {
  it("detects and redacts common secret shapes", () => {
    assert.equal(looksLikeSecret("hello"), false);
    assert.equal(looksLikeSecret("sk-abcdefghijklmnopqrstuvwxyz123456"), true);
    assert.equal(looksLikeSecret("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb"), true);

    const redacted = redactSecrets("gagal: sk-abcdefghijklmnopqrstuvwxyz123456 please retry");
    assert.match(redacted, /REDACTED_KEY/);
    assert.doesNotMatch(redacted, /sk-abcdef/);
  });

  it("safeClientError hides unknown / secret-looking messages", () => {
    assert.equal(safeClientError(new Error("sk-abcdefghijklmnopqrstuvwxyz123456")), "Gagal memanggil AI Assisten.");
    assert.match(safeClientError(new Error("Sesi kamu sudah habis. Silakan masuk lagi.")), /Sesi kamu/);
    assert.equal(safeClientError(new Error("ECONNRESET weird stack")), "Gagal memanggil AI Assisten.");
  });
});

describe("AI rate limit", () => {
  it("allows up to max then blocks", () => {
    resetAiRateLimitForTests();
    const uid = "user-test-1";
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) {
      assert.equal(checkAiRateLimit(uid, now + i, 60_000, 20).ok, true);
    }
    const blocked = checkAiRateLimit(uid, now + 21, 60_000, 20);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
  });
});
