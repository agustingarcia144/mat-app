"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getVideoEmbedUrl } from "@repo/core/utils";

interface ExerciseVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  exerciseName: string;
}

export default function ExerciseVideoDialog({
  open,
  onOpenChange,
  videoUrl,
  exerciseName,
}: ExerciseVideoDialogProps) {
  const embedUrl = videoUrl ? getVideoEmbedUrl(videoUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{exerciseName}</DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-2">
          {embedUrl ? (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted">
              <iframe
                src={embedUrl}
                title={`Video de ${exerciseName}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay video disponible para este ejercicio.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
