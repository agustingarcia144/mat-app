import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { PlanificationData } from "../library/planification-list";
import { toast } from "sonner";

function DeletePlanificationDialog({
  open,
  onOpenChange,
  planification,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planification: PlanificationData;
  onSuccess?: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const removePlanification = useMutation(api.planifications.remove);
  const archivePlanification = useMutation(api.planifications.archive);

  const hasAssignmentHistory = planification.hasEverBeenAssigned === true;
  const planificationId = planification._id as Id<"planifications">;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      if (hasAssignmentHistory) {
        await archivePlanification({ id: planificationId });
      } else {
        await removePlanification({ id: planificationId });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to delete planification:", error);
      toast.error("Error al eliminar la planificación");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar planificación</DialogTitle>
          <DialogDescription>
            ¿Eliminar &quot;{planification.name}&quot;? Esta acción no se puede
            deshacer y se eliminarán todos los datos asociados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeletePlanificationDialog;
