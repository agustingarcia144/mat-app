const YOUTUBE_VIDEO_ID_REGEX =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

/**
 * Extract YouTube video ID from a YouTube URL
 */
export function getYoutubeVideoId(url: string): string | null {
  if (!url?.trim()) return null;
  try {
    const match = url.match(YOUTUBE_VIDEO_ID_REGEX);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get thumbnail URL from video URL (YouTube, YouTube Shorts, Vimeo)
 */
export function getVideoThumbnailUrl(url: string): string | null {
  if (!url?.trim()) return null;

  try {
    const videoId = getYoutubeVideoId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get embeddable video URL (clean UI)
 */
export function getVideoEmbedUrl(url: string): string | null {
  if (!url?.trim()) return null;

  try {
    const videoId = getYoutubeVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`;
    }

    return null;
  } catch {
    return null;
  }
}
