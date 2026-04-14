// https://github.com/bluesky-social/atproto/issues/910
import Proto, { type AtpAgent, RichText } from "@atproto/api";
import { fitImageToByteLimit } from "./image.js";
import type { CommonPostData } from "./types.js";

const { BskyAgent } = Proto;

const FILE_SIZE_LIMIT = 1000000;
const VIDEO_FILE_SIZE_LIMIT = 100_000_000; // 100mb

class BskyClient {
  agent: AtpAgent;
  constructor(agent: AtpAgent) {
    this.agent = agent;
  }

  isValid = (post: CommonPostData): boolean => {
    console.log(post);

    if (!post.isPublic) {
      console.log(`Post is not public`);
      return false;
    }
    if (!post.createdAt.isValid) {
      console.log(`Invalid time ${post.createdAt}`);
      return false;
    }

    // 許す
    if (!post.text) {
      console.log(`Text is empty`);
      return true;
    }
    // 許す
    if (post.files.length > 4) {
      console.log(`Too many files ${post.files.length}`);
      return true;
    }

    // 300 graphemes
    // [...new Intl.Segmenter().segment('🏳️‍⚧️🏳️‍🌈👩🏾‍❤️‍👨🏻')].length;

    return true;
  };

  convertImg = async (original: Blob): Promise<Buffer> => {
    return await fitImageToByteLimit(original, FILE_SIZE_LIMIT);
  };

  post = async (post: CommonPostData) => {
    if (!this.isValid(post)) {
      return;
      // 稀にisPublic:falseになる。気になるがいったん無視
      // throw Error(`Invalid Post`);
    }

    const attachmentBlobs = await Promise.all(
      post.files.map(async (e): Promise<Blob> => {
        const url = e.url;
        const blob = await fetch(url).then((r) => r.blob());
        return blob;
      }),
    );

    const attachmentImages = attachmentBlobs.filter((e) =>
      e.type.startsWith("image/"),
    );

    const attachmentVideos = attachmentBlobs.filter((e) =>
      e.type.startsWith("video/"),
    );

    const embed = await (async () => {
      // app.bsky.feed.post embed は images/video の同時添付ができないため、
      // video があれば優先して添付する
      if (attachmentVideos.length > 0) {
        const video = attachmentVideos[0];
        if (attachmentVideos.length > 1) {
          console.log(
            `Too many videos ${attachmentVideos.length}, only first will be posted`,
          );
        }

        if (video.type !== "video/mp4") {
          console.log(
            `Unsupported video type ${video.type}, fallback to image embed if possible`,
          );
        } else if (video.size > VIDEO_FILE_SIZE_LIMIT) {
          console.log(
            `Video is too large ${video.size}, fallback to image embed if possible`,
          );
        } else {
          const videoBuffer = Buffer.from(await video.arrayBuffer());
          const { data } = await this.agent.uploadBlob(videoBuffer, {
            encoding: video.type,
          });

          return {
            $type: "app.bsky.embed.video",
            video: data.blob,
            alt: "",
          } as const;
        }
      }

      if (attachmentImages.length > 0) {
        // sharp
        const imgBlobs = await Promise.all(
          attachmentImages
            .slice(0, 4)
            .map(
              async (
                origblob,
              ): Promise<Proto.ComAtprotoRepoUploadBlob.OutputSchema> => {
                const imgBuffer = await this.convertImg(origblob);
                const { data } = await this.agent.uploadBlob(imgBuffer, {
                  encoding: origblob.type,
                });

                return data;
              },
            ),
        );

        return {
          $type: "app.bsky.embed.images",
          images: imgBlobs.map((e) => ({
            alt: "",
            image: e.blob,
          })),
        } as const;
      }

      return undefined;
    })();

    const rt = new RichText({ text: post.text ?? "" });
    await rt.detectFacets(this.agent);

    await this.agent.post(
      (() => {
        const createdAt = post.createdAt.toISO();
        if (!createdAt) {
          throw new Error("createdAt could not be converted to ISO");
        }

        const record: Parameters<BskyClient["agent"]["post"]>[0] = {
          text: rt.text,
          facets: rt.facets,
          createdAt,
          langs: ["ja", "ja-JP"],
        };

        if (embed) {
          record.embed = embed;
        } else if (!record.text) {
          // embed が無いのに空文字は避ける
          record.text = "-";
        }

        return record;
      })(),
    );
  };
}

export const initBsky = async (
  identifier: string,
  password: string,
): Promise<BskyClient> => {
  const agent = new BskyAgent({
    service: "https://bsky.social",
  });
  await agent.login({
    identifier,
    password,
  });

  return new BskyClient(agent);
};
