/**
 * Get embed URL from video URL (YouTube, YouTube Shorts, Vimeo)
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
    // Vimeo: vimeo.com/123456789
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get thumbnail URL from video URL (YouTube, YouTube Shorts, Vimeo)
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
    // Vimeo: vimeo.com/123456789
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeoMatch) {
      return `https://vumbnail.com/${vimeoMatch[1]}.jpg`
    }
    return null
  } catch {
    return null
  }
}
