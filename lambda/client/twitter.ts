import { EUploadMimeType, TwitterApi } from "twitter-api-v2";
import { fitImageToByteLimit } from "./image.js";
import type { CommonPostData } from "./types.js";

const X_IMAGE_SIZE_LIMIT_BYTES = 5_242_880;

type UploadContext = {
  originalID: string;
  mediaIndex: number;
  url: string;
};

const getMimeType = (value: string): EUploadMimeType | undefined => {
  switch (value.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return EUploadMimeType.Jpeg;
    case "png":
      return EUploadMimeType.Png;
    case "webp":
      return EUploadMimeType.Webp;
    case "gif":
      return EUploadMimeType.Gif;
    case "mov":
      return EUploadMimeType.Mov;
    case "mp4":
      return EUploadMimeType.Mp4;
    default:
      return undefined;
  }
};

const isStaticImageMimeType = (mimeType: EUploadMimeType): boolean =>
  mimeType === EUploadMimeType.Jpeg ||
  mimeType === EUploadMimeType.Png ||
  mimeType === EUploadMimeType.Webp;

export class TwitterClient {
  userClient: TwitterApi;

  constructor(
    appKey: string,
    appSecret: string,
    accessToken: string,
    accessSecret: string,
  ) {
    this.userClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
  }

  uploadMedia = async (
    original: Blob,
    extension: string,
    context: UploadContext,
  ): Promise<string | undefined> => {
    if (!extension) {
      console.error(`Invalid extension: ${extension}`);
      return undefined;
    }

    const mimeType = getMimeType(extension);
    if (!mimeType) {
      console.error(`[Twitter] Invalid extension: ${extension}`);
      return undefined;
    }

    const originalBuffer = Buffer.from(await original.arrayBuffer());
    const uploadBuffer =
      isStaticImageMimeType(mimeType) &&
      originalBuffer.byteLength > X_IMAGE_SIZE_LIMIT_BYTES
        ? await fitImageToByteLimit(original, X_IMAGE_SIZE_LIMIT_BYTES)
        : originalBuffer;

    console.log("[Twitter] Uploading media", {
      originalID: context.originalID,
      mediaIndex: context.mediaIndex,
      url: context.url,
      originalSize: originalBuffer.byteLength,
      finalSize: uploadBuffer.byteLength,
      mimeType,
    });

    try {
      return await this.userClient.v1.uploadMedia(uploadBuffer, {
        mimeType,
      });
    } catch (error) {
      console.error("[Twitter] Failed media upload", {
        originalID: context.originalID,
        mediaIndex: context.mediaIndex,
        url: context.url,
        originalSize: originalBuffer.byteLength,
        finalSize: uploadBuffer.byteLength,
        mimeType,
      });
      throw error;
    }
  };

  post = async (post: CommonPostData) => {
    const mediaIDs = (
      await Promise.all(
        // 4つまで
        post.files.slice(0, 4).map(async (f, mediaIndex) => {
          const url = f.url;
          // `.webp?sensitive=true` などに対処
          const extensionPart = url.split(".").pop();
          if (!extensionPart) {
            throw new Error(
              `[Twitter] Cannot determine file extension: ${url}`,
            );
          }
          const extension = extensionPart.replace(/\?+.*$/, "");
          const origblob = await fetch(url).then((r) => r.blob());
          const mediaID = await this.uploadMedia(origblob, extension, {
            originalID: post.originalID,
            mediaIndex,
            url,
          });
          if (!mediaID)
            throw new Error(
              `[Twitter] Cannot upload image: ${f.url}, ext: ${extension}`,
            );
          return mediaID;
        }),
      )
    ).filter((e) => e !== "");
    const param =
      mediaIDs.length > 0
        ? {
            media: {
              media_ids: mediaIDs as [string], // Type Errorを回避するため、適当に長さ1を指定
            },
          }
        : {};
    const text = () => {
      if (post.text.length >= 140) return `${post.text.slice(0, 135)}[略]`;
      else return post.text;
    };
    const t = await this.userClient.v2.tweet(text(), param);
    console.log("[Twitter] Posted tweet", {
      originalID: post.originalID,
      tweetID: t.data.id,
      mediaCount: mediaIDs.length,
    });
    console.log(t.data);
  };
}
