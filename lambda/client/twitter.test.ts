import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { TwitterClient } from "./twitter.js";

const createNoiseImageBlob = async (
  width: number,
  height: number,
): Promise<Blob> => {
  const pixels = Buffer.alloc(width * height * 3);
  randomFillSync(pixels);

  const buffer = await sharp(pixels, {
    raw: {
      width,
      height,
      channels: 3,
    },
  })
    .png()
    .toBuffer();

  return new Blob([new Uint8Array(buffer)], { type: "image/png" });
};

test("TwitterClient.uploadMedia compresses large static images before upload", async () => {
  const client = new TwitterClient("appKey", "appSecret", "token", "secret");
  const uploaded: {
    buffer?: Buffer;
    mimeType?: string;
  } = {};

  client.userClient = {
    v1: {
      uploadMedia: async (buffer: Buffer, options: { mimeType: string }) => {
        uploaded.buffer = buffer;
        uploaded.mimeType = options.mimeType;
        return "media-id";
      },
    },
  } as TwitterClient["userClient"];

  const blob = await createNoiseImageBlob(1800, 1800);
  const originalBuffer = Buffer.from(await blob.arrayBuffer());

  assert.ok(originalBuffer.byteLength > 5_242_880);

  const mediaID = await client.uploadMedia(blob, "png", {
    originalID: "post-1",
    mediaIndex: 0,
    url: "https://example.com/image.png",
  });

  assert.equal(mediaID, "media-id");
  assert.equal(uploaded.mimeType, "image/png");
  assert.ok(uploaded.buffer);
  assert.ok(uploaded.buffer.byteLength <= 5_242_880);
  assert.ok(uploaded.buffer.byteLength < originalBuffer.byteLength);
});
