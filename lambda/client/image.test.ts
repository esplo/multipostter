import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { fitImageToByteLimit } from "./image.js";

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

test("fitImageToByteLimit keeps images under the limit unchanged", async () => {
  const blob = await createNoiseImageBlob(80, 80);
  const originalBuffer = Buffer.from(await blob.arrayBuffer());

  const resizedBuffer = await fitImageToByteLimit(
    blob,
    originalBuffer.byteLength + 128,
  );

  assert.deepEqual(resizedBuffer, originalBuffer);
});

test("fitImageToByteLimit shrinks large images until they fit", async () => {
  const blob = await createNoiseImageBlob(1400, 1400);
  const originalBuffer = Buffer.from(await blob.arrayBuffer());

  const resizedBuffer = await fitImageToByteLimit(blob, 800_000);

  assert.ok(originalBuffer.byteLength > 800_000);
  assert.ok(resizedBuffer.byteLength <= 800_000);
  assert.ok(resizedBuffer.byteLength < originalBuffer.byteLength);
});

test("fitImageToByteLimit throws when an image cannot be reduced enough", async () => {
  const blob = await createNoiseImageBlob(1400, 1400);

  await assert.rejects(
    fitImageToByteLimit(blob, 50_000),
    /cannot fit image within 50000 bytes/,
  );
});
