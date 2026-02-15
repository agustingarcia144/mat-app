'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  getVideoThumbnailUrl,
  getVideoEmbedUrl,
} from '@repo/core/utils'

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
