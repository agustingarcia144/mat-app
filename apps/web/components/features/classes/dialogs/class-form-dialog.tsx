"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { classSchema, type ClassForm } from "@repo/core/schemas";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

type MembershipWithUser = {
  role: string;
  userId: string;
  fullName?: string;
  email?: string;
};

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: Id<"classes">;
  onSuccess?: () => void;
}

export default function ClassFormDialog({
  open,
  onOpenChange,
  classId,
  onSuccess,
}: ClassFormDialogProps) {
  const createClass = useMutation(api.classes.create);
  const updateClass = useMutation(api.classes.update);
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQueryCurrentOrganization ? {} : "skip",
  );
  const existingClass = useQuery(
    api.classes.getById,
    open && classId && canQueryCurrentOrganization ? { id: classId } : "skip",
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trainerComboOpen, setTrainerComboOpen] = useState(false);

  const form = useForm<ClassForm>({
    resolver: zodResolver(classSchema as any) as any,
    defaultValues: {
      name: "",
      description: "",
      capacity: 30,
      trainerId: undefined,
      bookingWindowDays: 7,
      cancellationWindowHours: 2,
      isRecurring: false,
      recurrencePattern: undefined,
      isActive: true,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form;

  // Load existing class data
  useEffect(() => {
    if (existingClass) {
      reset({
        name: existingClass.name,
        description: existingClass.description || "",
        capacity: existingClass.capacity,
        trainerId: existingClass.trainerId,
        bookingWindowDays: existingClass.bookingWindowDays,
        cancellationWindowHours: existingClass.cancellationWindowHours,
        isRecurring: existingClass.isRecurring,
        recurrencePattern: existingClass.recurrencePattern,
        isActive: existingClass.isActive,
      });
    }
  }, [existingClass, reset]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset({
        name: "",
        description: "",
        capacity: 30,
        trainerId: undefined,
        bookingWindowDays: 7,
        cancellationWindowHours: 2,
        isRecurring: false,
        recurrencePattern: undefined,
        isActive: true,
      });
    }
  }, [open, reset]);

  const trainers =
    memberships?.filter((m: MembershipWithUser) => m.role === "trainer") || [];

  const onSubmit = async (data: ClassForm) => {
    setIsSubmitting(true);
    try {
      if (classId) {
        await updateClass({
          id: classId,
          ...data,
        });
      } else {
        await createClass(data);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error saving class:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la clase",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle>{classId ? "Editar clase" : "Nueva clase"}</SheetTitle>
          <SheetDescription>
            {classId
              ? "Los cambios aplican a los turnos futuros."
              : "Después vas a poder crearle turnos."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit as any)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <div className="space-y-4">
              <Field>
                <FieldLabel>Nombre</FieldLabel>
                <Input
                  {...register("name")}
                  placeholder="Ej: Funcional mañana"
                  autoFocus
                />
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </Field>

              <Field>
                <FieldLabel>
                  Descripción{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </FieldLabel>
                <Textarea
                  {...register("description")}
                  placeholder="Qué se hace, nivel, qué traer..."
                  rows={2}
                />
                {errors.description && (
                  <FieldError>{errors.description.message}</FieldError>
                )}
              </Field>

              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                <Field>
                  <FieldLabel>Cupos</FieldLabel>
                  <Input
                    type="number"
                    inputMode="numeric"
                    {...register("capacity", { valueAsNumber: true })}
                    min={1}
                    max={1000}
                  />
                </Field>

                <Field>
                  <FieldLabel>
                    Entrenador{" "}
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </FieldLabel>
                  <Controller
                    name="trainerId"
                    control={control}
                    render={({ field }) => (
                      <Popover
                        open={trainerComboOpen}
                        onOpenChange={setTrainerComboOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            <span
                              className={cn(
                                "truncate",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              {field.value
                                ? trainers.find(
                                    (t: MembershipWithUser) =>
                                      t.userId === field.value,
                                  )?.fullName || "Sin entrenador"
                                : "Sin entrenador"}
                            </span>
                            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0"
                          align="start"
                        >
                          <Command>
                            <CommandInput placeholder="Buscar entrenador..." />
                            <CommandList>
                              <CommandEmpty>
                                No se encontraron entrenadores
                              </CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    field.onChange(undefined);
                                    setTrainerComboOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 size-4",
                                      !field.value
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  Sin entrenador
                                </CommandItem>
                                {trainers.map((trainer: MembershipWithUser) => (
                                  <CommandItem
                                    key={trainer.userId}
                                    value={trainer.userId}
                                    onSelect={() => {
                                      field.onChange(trainer.userId);
                                      setTrainerComboOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 size-4",
                                        field.value === trainer.userId
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {trainer.fullName || trainer.email}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  />
                </Field>
              </div>
              {errors.capacity && (
                <FieldError>{errors.capacity.message}</FieldError>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reservas
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Abren con</FieldLabel>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="numeric"
                      {...register("bookingWindowDays", {
                        valueAsNumber: true,
                      })}
                      min={0}
                      max={365}
                      className="pr-16"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      días
                    </span>
                  </div>
                  <FieldDescription>de anticipación</FieldDescription>
                  {errors.bookingWindowDays && (
                    <FieldError>{errors.bookingWindowDays.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Cancelan hasta</FieldLabel>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="numeric"
                      {...register("cancellationWindowHours", {
                        valueAsNumber: true,
                      })}
                      min={0}
                      max={168}
                      className="pr-16"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      horas
                    </span>
                  </div>
                  <FieldDescription>antes del turno</FieldDescription>
                  {errors.cancellationWindowHours && (
                    <FieldError>
                      {errors.cancellationWindowHours.message}
                    </FieldError>
                  )}
                </Field>
              </div>
            </div>

            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Clase activa
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Si la desactivás, los miembros dejan de verla.
                    </span>
                  </span>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </label>
              )}
            />
          </div>

          <div className="flex gap-2 border-t p-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting
                ? "Guardando..."
                : classId
                  ? "Guardar cambios"
                  : "Crear clase"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
