import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { decryptSecret, encryptSecret, hintForApiKey } from "./crypto";

describe("AI credential crypto", () => {
  const prev = process.env.AI_CREDENTIALS_SECRET;

  before(() => {
    process.env.AI_CREDENTIALS_SECRET = "test-secret-at-least-16-chars";
  });

  after(() => {
    if (prev === undefined) delete process.env.AI_CREDENTIALS_SECRET;
    else process.env.AI_CREDENTIALS_SECRET = prev;
  });

  it("round-trips secrets and builds hint", () => {
    const plain = "sk-test-openai-key-abcdefghijklmnop";
    const enc = encryptSecret(plain);
    assert.match(enc, /^v1\./);
    assert.equal(decryptSecret(enc), plain);
    assert.equal(hintForApiKey(plain), "…mnop");
  });
});
