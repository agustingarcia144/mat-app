"use client";
"use no memo";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "convex/react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BILLING_ACCESS_LABELS,
  BILLING_ACCESS_ORDER,
  formatDay,
  type PlatformBillingAccess,
} from "@/components/features/platform/platform-labels";

const createCodeSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Poné una etiqueta para identificar el código"),
  billingAccess: z.enum(["legacy", "lite"]),
  code: z.string().optional(),
  maxUses: z.coerce.number().int().min(1, "Mínimo 1 uso"),
  expiresInDays: z.string().optional(),
  notes: z.string().optional(),
});

type CreateCodeForm = z.input<typeof createCodeSchema>;

interface CreatedCode {
  code: string;
  expiresAt: number | null;
  billingAccess: PlatformBillingAccess;
}

interface CreateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateCodeDialog({
  open,
  onOpenChange,
}: CreateCodeDialogProps) {
  const createCode = useAction(api.orgCreationCodes.createOrgCreationCode);
  const [created, setCreated] = useState<CreatedCode | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCodeForm>({
    resolver: zodResolver(createCodeSchema) as any,
    defaultValues: {
      label: "",
      billingAccess: "legacy",
      code: "",
      maxUses: 1,
      expiresInDays: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) return;
    // Reset only after the dialog closes so the revealed code stays visible.
    setCreated(null);
    setCopied(false);
    reset();
  }, [open, reset]);

  const billingAccess = watch("billingAccess");

  const onSubmit = async (values: CreateCodeForm) => {
    try {
      const parsed = createCodeSchema.parse(values);
      const expiresInDays = parsed.expiresInDays?.trim()
        ? Number(parsed.expiresInDays)
        : undefined;
      if (expiresInDays !== undefined && !Number.isFinite(expiresInDays)) {
        throw new Error("Los días de vencimiento deben ser un número");
      }

      const result = await createCode({
        code: parsed.code?.trim() || undefined,
        maxUses: parsed.maxUses,
        expiresInDays,
        billingAccess: parsed.billingAccess,
        label: parsed.label,
        notes: parsed.notes?.trim() || undefined,
      });

      setCreated({
        code: result.code,
        expiresAt: result.expiresAt,
        billingAccess: parsed.billingAccess,
      });
      toast.success("Código creado");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear el código",
      );
    }
  };

  const copyCode = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      toast.success("Código copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccionalo y copialo a mano.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Código creado</DialogTitle>
              <DialogDescription>
                Acceso {BILLING_ACCESS_LABELS[created.billingAccess]}
                {created.expiresAt
                  ? ` · vence el ${formatDay(created.expiresAt)}`
                  : " · sin vencimiento"}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted px-4 py-3 text-center">
              <p className="select-all break-all font-mono text-lg font-semibold">
                {created.code}
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-warning/40 px-3 py-2 text-sm text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Guardalo ahora. Los códigos se almacenan hasheados, así que no
                vas a poder volver a verlo: si lo perdés hay que revocarlo y
                crear uno nuevo.
              </span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={copyCode}>
                {copied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copied ? "Copiado" : "Copiar código"}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Crear código de alta</DialogTitle>
              <DialogDescription>
                Permite crear una organización sin pasar por Mercado Pago.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="label">Etiqueta</FieldLabel>
                <Input
                  id="label"
                  placeholder="Nombre del gimnasio"
                  {...register("label")}
                />
                <FieldDescription>
                  Es la única forma de identificar el código en el listado.
                </FieldDescription>
                {errors.label && (
                  <FieldError>{errors.label.message}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Acceso</FieldLabel>
                <Select
                  value={billingAccess}
                  onValueChange={(value) =>
                    setValue("billingAccess", value as PlatformBillingAccess)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_ACCESS_ORDER.map((key) => (
                      <SelectItem key={key} value={key}>
                        {BILLING_ACCESS_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {billingAccess === "lite"
                    ? "La organización queda limitada a los módulos Lite."
                    : "Acceso PRO completo, facturado fuera de la plataforma."}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="code">Código personalizado</FieldLabel>
                <Input
                  id="code"
                  placeholder="Se genera automáticamente"
                  className="font-mono uppercase"
                  {...register("code")}
                />
                <FieldDescription>
                  Solo letras y números; se normaliza a mayúsculas.
                </FieldDescription>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="maxUses">Usos máximos</FieldLabel>
                  <Input
                    id="maxUses"
                    type="number"
                    min={1}
                    step={1}
                    {...register("maxUses")}
                  />
                  {errors.maxUses && (
                    <FieldError>{errors.maxUses.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="expiresInDays">
                    Vence en (días)
                  </FieldLabel>
                  <Input
                    id="expiresInDays"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Sin vencimiento"
                    {...register("expiresInDays")}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="notes">Notas</FieldLabel>
                <Textarea id="notes" rows={2} {...register("notes")} />
              </Field>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creando..." : "Crear código"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
