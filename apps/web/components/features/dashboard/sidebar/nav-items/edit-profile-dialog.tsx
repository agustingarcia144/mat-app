"use client";

import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormState = {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
};

const EMPTY_STATE: FormState = {
  firstName: "",
  lastName: "",
  username: "",
  phone: "",
};

export default function EditProfileDialog({ open, onOpenChange }: Props) {
  const { user, isLoaded } = useUser();
  const [form, setForm] = useState<FormState>(EMPTY_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>;
    setForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      username: user.username ?? "",
      phone: typeof metadata.phone === "string" ? metadata.phone : "",
    });
  }, [open, user]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/secure/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          username: form.username,
          phone: form.phone,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "No se pudo actualizar el perfil");
      }

      await user?.reload();
      toast.success("Perfil actualizado");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-first-name">Nombre</Label>
              <Input
                id="profile-first-name"
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                maxLength={64}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-last-name">Apellido</Label>
              <Input
                id="profile-last-name"
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                maxLength={64}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-phone">Teléfono</Label>
            <Input
              id="profile-phone"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              disabled={isSubmitting}
              maxLength={30}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
