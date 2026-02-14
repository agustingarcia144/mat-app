'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

function getVideoThumbnailUrl(url: string): string | null {
  if (!url?.trim()) return null

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
}

function getVideoEmbedUrl(url: string): string | null {
  if (!url?.trim()) return null

  const ytMatch =
    url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    ) ?? null

  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&controls=0&modestbranding=1&rel=0`
  }

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)

  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&title=0&byline=0&portrait=0`
  }

  return null
}

interface Props {
  videoUrl: string
  title: string
}

export default function VideoPlayer({ videoUrl, title }: Props) {
  const [open, setOpen] = useState(false)

  const thumbnail = getVideoThumbnailUrl(videoUrl)
  const embed = getVideoEmbedUrl(videoUrl)

  if (!videoUrl || !embed) return null

  return (
    <>
      <div
        className="aspect-video w-full relative cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {thumbnail && (
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover"
          />
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 bg-black overflow-hidden">
          <DialogTitle className="sr-only">{title}</DialogTitle>

          <div className="aspect-video">
            <iframe
              src={embed}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
