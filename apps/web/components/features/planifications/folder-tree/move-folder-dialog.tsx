"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FolderTree } from "@/components/features/planifications/folder-tree/folder-tree";
import { getFolderAndDescendantIds } from "@/components/features/planifications/planification-folder-dnd";

interface FolderData {
  _id: string;
  name: string;
  parentId?: string;
  path: string;
  order: number;
}

interface MoveFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  folderName: string;
  folders: FolderData[];
  onSuccess?: () => void;
}

export default function MoveFolderDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  folders,
  onSuccess,
}: MoveFolderDialogProps) {
  const moveFolder = useMutation(api.folders.move);

  const invalidIds = getFolderAndDescendantIds(folderId, folders);
  const allowedFolders = folders.filter((f) => !invalidIds.has(f._id));

  const handleSelect = async (targetId: string | null) => {
    try {
      await moveFolder({
        id: folderId as any,
        newParentId: targetId === null ? undefined : (targetId as any),
      });
      toast.success("Carpeta movida");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Error al mover la carpeta");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover &quot;{folderName}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Elige la carpeta de destino o Todas para mover a la raíz.
        </p>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          <FolderTree
            folders={allowedFolders}
            selectedId={null}
            onSelect={handleSelect}
            showCreateDialog={false}
            setShowCreateDialog={() => {}}
            rootLabel="Todas"
            disableCreate
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
