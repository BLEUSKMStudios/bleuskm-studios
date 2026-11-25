import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignBlockReason, campaignFooter, personalize, unknownFields } from "./rules.ts";

test("bulk sending needs the switch and a postal address", () => {
  assert.match(campaignBlockReason({}) ?? "", /switched off/);
  assert.match(campaignBlockReason({ STUDIO_CAMPAIGNS: "on" }) ?? "", /mailing address/);
  assert.equal(campaignBlockReason({ STUDIO_CAMPAIGNS: "on", STUDIO_POSTAL_ADDRESS: "PO Box 1, Dallas, TX" }), null);
  assert.match(campaignBlockReason({ STUDIO_CAMPAIGNS: "yes", STUDIO_POSTAL_ADDRESS: "x" }) ?? "", /switched off/);
});

test("only first name and name are filled; anything else is flagged", () => {
  assert.equal(personalize("Hi {{first_name}}, {{ name }}", { name: "Zara Q Test" }), "Hi Zara, Zara Q Test");
  assert.equal(personalize("Hi {{first_name}}", { name: "" }), "Hi there");
  assert.deepEqual(unknownFields("Hi {{first_name}} {{film}} {{ city }} {{film}}"), ["film", "city"]);
});

test("the footer explains why, links to unsubscribe and has the address", () => {
  const f = campaignFooter({ audience: "Newsletter", address: "PO Box 1, Dallas, TX", unsubscribeUrl: "https://studio.bleuskm.com/u/abc" });
  assert.match(f, /subscribed to Newsletter/);
  assert.match(f, /Unsubscribe: https:\/\/studio\.bleuskm\.com\/u\/abc/);
  assert.match(f, /PO Box 1, Dallas, TX/);
});
