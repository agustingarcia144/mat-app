/**
 * Get embed URL from video URL (YouTube, YouTube Shorts)
 */
export function getVideoEmbedUrl(url: string): string | null {
  if (!url?.trim()) return null
  try {
    // YouTube: watch?v=, youtu.be/, embed/, shorts/
    const ytMatch =
      url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
      ) ?? null
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get thumbnail URL from video URL (YouTube, YouTube Shorts)
 */
export function getVideoThumbnailUrl(url: string): string | null {
  if (!url?.trim()) return null
  try {
    // YouTube: watch?v=, youtu.be/, embed/, shorts/
    const ytMatch =
      url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
      ) ?? null
    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
    }
    return null
  } catch {
    return null
  }
}
