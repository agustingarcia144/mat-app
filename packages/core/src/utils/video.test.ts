import { describe, expect, it } from "vitest";
import {
  getVideoEmbedUrl,
  getVideoThumbnailUrl,
  getYoutubeVideoId,
} from "./video";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("getYoutubeVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&t=42s`,
  ])("extracts the id from %s", (url) => {
    expect(getYoutubeVideoId(url)).toBe(VIDEO_ID);
  });

  it.each(["", "   ", "https://vimeo.com/123456789", "no es una url"])(
    "returns null for %j",
    (url) => {
      expect(getYoutubeVideoId(url)).toBeNull();
    },
  );
});

describe("getVideoThumbnailUrl", () => {
  it("builds the YouTube thumbnail url", () => {
    expect(getVideoThumbnailUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(
      `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`,
    );
  });

  it("returns null for unsupported urls", () => {
    expect(getVideoThumbnailUrl("https://example.com/video.mp4")).toBeNull();
  });
});

describe("getVideoEmbedUrl", () => {
  it("builds the YouTube embed url", () => {
    const embedUrl = getVideoEmbedUrl(`https://youtu.be/${VIDEO_ID}`);
    expect(embedUrl).toContain(`https://www.youtube.com/embed/${VIDEO_ID}?`);
    expect(embedUrl).toContain("playsinline=1");
  });

  it("returns null for unsupported urls", () => {
    expect(getVideoEmbedUrl("")).toBeNull();
  });
});
