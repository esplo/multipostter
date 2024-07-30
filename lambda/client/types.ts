import { DateTime } from "luxon";

export type CommonPostData = {
  originalID: string;
  text: string;
  files: Array<{
    url: string;
  }>;
  createdAt: DateTime;
  isPublic: boolean;
};
