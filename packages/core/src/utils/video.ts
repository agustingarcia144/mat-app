/**
 * Get thumbnail URL from video URL (YouTube, YouTube Shorts, Vimeo)
 */
export function getVideoThumbnailUrl(url: string): string | null {
  if (!url?.trim()) return null

  try {
    const ytMatch =
      url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
      ) ?? null

    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
    }

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)

    if (vimeoMatch) {
      return `https://vumbnail.com/${vimeoMatch[1]}.jpg`
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get embeddable video URL (clean UI)
 */
export function getVideoEmbedUrl(url: string): string | null {
  if (!url?.trim()) return null

  try {
    const ytMatch =
      url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
      ) ?? null

    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3`
    }

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)

    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&title=0&byline=0&portrait=0`
    }

    return null
  } catch {
    return null
  }
}
