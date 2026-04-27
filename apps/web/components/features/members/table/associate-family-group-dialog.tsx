"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
};

type FamilyGroup = {
  subscriptionId: Id<"memberPlanSubscriptions">;
  userId: string;
  headName: string;
  planId: Id<"membershipPlans">;
  planName: string;
  associatedNames: string[];
  coveredMemberCount: number;
  payableAmountArs: number;
};

const normalize = (value?: string) =>
  value?.trim().toLowerCase() ?? "";

export default function AssociateFamilyGroupDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
}: Props) {
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const familyGroups = useQuery(
    api.memberPlanSubscriptions.getActiveFamilyGroups,
    open ? {} : "skip",
  ) as FamilyGroup[] | undefined;
  const associateToFamilyGroup = useMutation(
    api.memberPlanSubscriptions.associateToFamilyGroup,
  );

  const filteredGroups = useMemo(() => {
    const searchValue = normalize(search);
    return (familyGroups ?? []).filter((group) => {
      if (group.userId === memberId) return false;
      if (!searchValue) return true;
      return (
        normalize(group.headName).includes(searchValue) ||
        normalize(group.planName).includes(searchValue) ||
        group.associatedNames.some((name) =>
          normalize(name).includes(searchValue),
        )
      );
    });
  }, [familyGroups, memberId, search]);

  const handleAssociate = async (
    parentSubscriptionId: Id<"memberPlanSubscriptions">,
  ) => {
    setIsSubmitting(true);
    try {
      await associateToFamilyGroup({
        userId: memberId,
        parentSubscriptionId,
      });
      toast.success("Miembro asociado al grupo familiar");
      onOpenChange(false);
      setSearch("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo asociar al grupo familiar",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Asociar a Grupo Familiar</DialogTitle>
          <DialogDescription>
            Buscá un grupo familiar activo para incorporar a {memberName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Buscar por titular, plan o asociado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {familyGroups === undefined ? (
            <p className="text-sm text-muted-foreground">Cargando grupos...</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay grupos familiares activos que coincidan con la búsqueda.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {filteredGroups.map((group) => (
                <div
                  key={group.subscriptionId}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{group.headName}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.planName}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {group.coveredMemberCount} miembro(s)
                        </Badge>
                        <Badge variant="outline">
                          ${group.payableAmountArs.toLocaleString("es-AR")}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleAssociate(group.subscriptionId)}
                      disabled={isSubmitting}
                    >
                      Asociar
                    </Button>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Asociados actuales:
                    </span>{" "}
                    {group.associatedNames.length > 0
                      ? group.associatedNames.join(", ")
                      : "Sin asociados todavía"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
