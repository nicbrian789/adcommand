import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseActionBlock, stripActionBlock } from "./actionParse";
import { validateParsedAction } from "./actionValidate";

describe("AI action parse/validate", () => {
  it("parses and strips ACTION block", () => {
    const reply = `Diagnosis singkat.\n\n<<<ACTION>>>\n{"type":"pause_campaign","targetId":"11111111-1111-1111-1111-111111111111","reason":"CPR mahal"}\n<<<END_ACTION>>>`;
    const parsed = parseActionBlock(reply);
    assert.deepEqual(parsed, {
      type: "pause_campaign",
      targetId: "11111111-1111-1111-1111-111111111111",
      reason: "CPR mahal",
    });
    assert.equal(stripActionBlock(reply), "Diagnosis singkat.");
  });

  it("rejects invalid UUID or unknown type", () => {
    assert.equal(parseActionBlock(`<<<ACTION>>>{"type":"delete_all","targetId":"11111111-1111-1111-1111-111111111111"}<<<END_ACTION>>>`), null);
    assert.equal(parseActionBlock(`<<<ACTION>>>{"type":"pause_campaign","targetId":"not-a-uuid"}<<<END_ACTION>>>`), null);
  });

  it("validates TrafficStars pause and sync only for known catalog ids", () => {
    const catalog = {
      networks: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "TS", provider: "trafficstars" }],
      campaigns: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "C1",
          status: "Running",
          networkId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          networkName: "TS",
          provider: "trafficstars",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "TF",
          status: "Running",
          networkId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          networkName: "TF",
          provider: "traffic_factory",
        },
      ],
    };

    assert.ok(
      validateParsedAction(
        { type: "pause_campaign", targetId: "11111111-1111-1111-1111-111111111111" },
        catalog
      )
    );
    assert.equal(
      validateParsedAction(
        { type: "pause_campaign", targetId: "22222222-2222-2222-2222-222222222222" },
        catalog
      ),
      null
    );
    assert.ok(
      validateParsedAction(
        { type: "sync_network", targetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
        catalog
      )
    );
  });
});
