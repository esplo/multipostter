import axios from "axios";
import { DateTime } from "luxon";
import type { CommonPostData } from "./types.js";

const BASE_URL = "https://misskey.io/api";
// const commonData = { i: ACCESS_KEY };
const headers = {
  "Content-Type": "application/json",
};

type NotesShowResponse = NoteInfo[];
type NoteInfo = {
  id: "xxxxxxxxxx";
  createdAt: "2019-08-24T14:15:22Z";
  deletedAt: "2019-08-24T14:15:22Z";
  text: string;
  cw: "string";
  userId: "string";
  user: {
    id: "xxxxxxxxxx";
    name: "xxx";
    username: "xxxx";
    host: "misskey.example.com";
    avatarUrl: "string";
    avatarBlurhash: "string";
    avatarDecorations: [
      {
        id: "string";
        angle: 0;
        flipH: true;
        url: "string";
        offsetX: 0;
        offsetY: 0;
      },
    ];
    isBot: true;
    isCat: true;
    instance: {
      name: "string";
      softwareName: "string";
      softwareVersion: "string";
      iconUrl: "string";
      faviconUrl: "string";
      themeColor: "string";
    };
    emojis: {
      property1: "string";
      property2: "string";
    };
    onlineStatus: "unknown";
    badgeRoles: [
      {
        name: "string";
        iconUrl: "string";
        displayOrder: 0;
      },
    ];
  };
  replyId: "xxxxxxxxxx";
  renoteId: "xxxxxxxxxx";
  reply: Record<string, never>;
  renote: Record<string, never>;
  isHidden: true;
  visibility: "public";
  mentions: ["string"];
  visibleUserIds: ["string"];
  fileIds: ["string"];
  files: [
    {
      id: "xxxxxxxxxx";
      createdAt: "2019-08-24T14:15:22Z";
      name: "lenna.jpg";
      type: "image/jpeg";
      md5: "15eca7fba0480996e2245f5185bf39f2";
      size: 51469;
      isSensitive: true;
      blurhash: "string";
      properties: {
        width: 1280;
        height: 720;
        orientation: 8;
        avgColor: "rgb(40,65,87)";
      };
      url: string;
      thumbnailUrl: "string";
      comment: "string";
      folderId: "xxxxxxxxxx";
      folder: {
        id: "xxxxxxxxxx";
        createdAt: "2019-08-24T14:15:22Z";
        name: "string";
        parentId: "xxxxxxxxxx";
        foldersCount: 0;
        filesCount: 0;
        parent: Record<string, never>;
      };
      userId: "xxxxxxxxxx";
      user: {
        id: "xxxxxxxxxx";
        name: "xxxx";
        username: "xxx";
        host: "misskey.example.com";
        avatarUrl: "string";
        avatarBlurhash: "string";
        avatarDecorations: [
          {
            id: "string";
            angle: 0;
            flipH: true;
            url: "string";
            offsetX: 0;
            offsetY: 0;
          },
        ];
        isBot: true;
        isCat: true;
        instance: {
          name: "string";
          softwareName: "string";
          softwareVersion: "string";
          iconUrl: "string";
          faviconUrl: "string";
          themeColor: "string";
        };
        emojis: {
          property1: "string";
          property2: "string";
        };
        onlineStatus: "unknown";
        badgeRoles: [
          {
            name: "string";
            iconUrl: "string";
            displayOrder: 0;
          },
        ];
      };
    },
  ];
  tags: ["string"];
  poll: {
    expiresAt: "2019-08-24T14:15:22Z";
    multiple: true;
    choices: [
      {
        isVoted: true;
        text: "string";
        votes: 0;
      },
    ];
  };
  emojis: {
    property1: "string";
    property2: "string";
  };
  channelId: "xxxxxxxxxx";
  channel: {
    id: "string";
    name: "string";
    color: "string";
    isSensitive: true;
    allowRenoteToExternal: true;
    userId: "string";
  };
  localOnly: true;
  reactionAcceptance: "string";
  reactionEmojis: {
    property1: "string";
    property2: "string";
  };
  reactions: {
    property1: 0;
    property2: 0;
  };
  renoteCount: 0;
  repliesCount: 0;
  uri: "string";
  url: "string";
  reactionAndUserPairCache: ["string"];
  clippedCount: 0;
  myReaction: "string";
};

type MisskeyNoteLike = {
  id: string;
  createdAt: string;
  text?: string | null;
  files?: Array<{
    url: string;
  }>;
  visibility: string;
  isHidden: boolean;
  mentions?: string[] | null;
};

const REPLY_MENTION_PATTERN = /(^|[\s(])@[\w.-]+(?:@[\w.-]+)?/u;

export const shouldSkipCrossPostFromMisskeyNote = (
  note: Pick<MisskeyNoteLike, "mentions" | "text">,
): boolean =>
  (note.mentions?.length ?? 0) > 0 ||
  REPLY_MENTION_PATTERN.test(note.text ?? "");

export async function fetchMyPosts(
  myUserId: string,
  sinceId: string | undefined,
): Promise<CommonPostData[]> {
  const followingResponse = await axios.post<NotesShowResponse>(
    `${BASE_URL}/users/notes`,
    {
      userId: myUserId,
      withReplies: false,
      withRenotes: false,
      withChannelNotes: true,

      limit: 50,
      sinceId,
    },
    {
      headers,
    },
  );
  const t = await Promise.all(followingResponse.data.map(parseNote));
  t.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

  return t;
}

export async function parseNote(
  note: MisskeyNoteLike,
): Promise<CommonPostData> {
  const text = note.text ?? "";
  const files = note.files?.map((e) => ({ url: e.url })) ?? [];
  const mentions = note.mentions ?? [];
  const shouldCrossPost = !shouldSkipCrossPostFromMisskeyNote({
    mentions,
    text,
  });
  const d = {
    originalID: note.id,
    text,
    files,
    createdAt: DateTime.fromISO(note.createdAt),
    isPublic: note.visibility === "public" && !note.isHidden,
    shouldCrossPost,
    skipCrossPostReason: shouldCrossPost
      ? undefined
      : "Misskey note contains a reply mention",
  };
  return d;
}
