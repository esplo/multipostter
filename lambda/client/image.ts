import sharp from "sharp";

const RESIZE_WIDTHS = [1920, 1280, 980, 480] as const;

export async function fitImageToByteLimit(
  original: Blob,
  maxBytes: number,
): Promise<Buffer> {
  const originalBuffer = Buffer.from(await original.arrayBuffer());
  if (originalBuffer.byteLength <= maxBytes) {
    return originalBuffer;
  }

  for (const width of RESIZE_WIDTHS) {
    const resizedBuffer = await sharp(originalBuffer, { animated: true })
      .resize({
        width,
        withoutEnlargement: true,
      })
      .toBuffer();
    if (resizedBuffer.byteLength <= maxBytes) {
      return resizedBuffer;
    }
  }

  throw new Error(`cannot fit image within ${maxBytes} bytes`);
}
