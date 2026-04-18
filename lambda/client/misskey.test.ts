import assert from "node:assert/strict";
import test from "node:test";
import { parseNote, shouldSkipCrossPostFromMisskeyNote } from "./misskey.js";

test("shouldSkipCrossPostFromMisskeyNote returns true when mentions are present", () => {
  assert.equal(
    shouldSkipCrossPostFromMisskeyNote({
      mentions: ["alice"],
      text: "@alice hello",
    }),
    true,
  );
});

test("shouldSkipCrossPostFromMisskeyNote falls back to text detection", () => {
  assert.equal(
    shouldSkipCrossPostFromMisskeyNote({
      mentions: [],
      text: "@alice hello",
    }),
    true,
  );
});

test("shouldSkipCrossPostFromMisskeyNote ignores email-like text", () => {
  assert.equal(
    shouldSkipCrossPostFromMisskeyNote({
      mentions: [],
      text: "hello@example.com",
    }),
    false,
  );
});

test("parseNote marks Misskey replies as non-cross-postable", async () => {
  const post = await parseNote({
    id: "note-1",
    createdAt: "2026-04-14T00:00:00Z",
    text: "@alice hello",
    files: [],
    visibility: "public",
    isHidden: false,
    mentions: ["alice"],
  });

  assert.equal(post.shouldCrossPost, false);
  assert.equal(
    post.skipCrossPostReason,
    "Misskey note contains a reply mention",
  );
});

test("parseNote tolerates missing mentions and files", async () => {
  const post = await parseNote({
    id: "note-2",
    createdAt: "2026-04-14T00:00:00Z",
    text: "plain note",
    visibility: "public",
    isHidden: false,
  });

  assert.equal(post.shouldCrossPost, true);
  assert.deepEqual(post.files, []);
});
