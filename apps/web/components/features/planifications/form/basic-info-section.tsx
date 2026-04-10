"use client";

import { useState } from "react";
import { Controller, UseFormReturn } from "react-hook-form";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderTree } from "@/components/features/planifications/folder-tree/folder-tree";
import { useCanQueryCurrentOrganization } from "@/hooks/use-can-query-current-organization";

interface BasicInfoSectionProps {
  form: UseFormReturn<any>;
  /** When false, the chevron icon is hidden. Default true. */
  showCollapsibleIcon?: boolean;
  /** When true, the Tipo (Planificación/Plantilla) field is disabled. Use for edit mode. */
  isEditMode?: boolean;
  /** When true, hide Tipo radio (create-from-template mode: always Planificación). */
  createFromTemplate?: boolean;
  /** When true, show template selector for create flow. Always visible in create mode. */
  showTemplateSelector?: boolean;
  /** Currently selected template id (for display). Controlled by parent. */
  selectedTemplateId?: string;
  /** Called when user selects/changes template. templateId is '__none__' for "Ninguna", or template id. */
  onTemplateChange?: (
    templateId: string,
    template?: { name: string; description?: string },
  ) => void;
}

export default function BasicInfoSection({
  form,
  showCollapsibleIcon = true,
  isEditMode = false,
  createFromTemplate = false,
  showTemplateSelector = false,
  selectedTemplateId,
  onTemplateChange,
}: BasicInfoSectionProps) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization();
  const folders = useQuery(
    api.folders.getTree,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const templates = useQuery(
    api.planifications.getTemplates,
    canQueryCurrentOrganization ? {} : "skip",
  );
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const isTemplate = form.watch("isTemplate");

  const handleTemplateSelect = (value: string) => {
    if (value === "__none__") {
      onTemplateChange?.("__none__", undefined);
      return;
    }
    const template = templates?.find(
      (t: Doc<"planifications">) => t._id === value,
    );
    onTemplateChange?.(
      value,
      template
        ? { name: template.name, description: template.description }
        : undefined,
    );
  };

  const templateSelectorNode =
    showTemplateSelector && !isTemplate ? (
      <Field>
        <FieldLabel className="mb-2 block">Plantilla como base</FieldLabel>
        <Select
          value={selectedTemplateId ?? "__none__"}
          onValueChange={handleTemplateSelect}
        >
          <SelectTrigger>
            <SelectValue placeholder="Ninguna (crear vacía)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Ninguna (crear vacía)</SelectItem>
            {(templates ?? []).map((t: Doc<"planifications">) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Opcional. Selecciona una plantilla para copiar su contenido.
        </FieldDescription>
      </Field>
    ) : null;

  const formContent = (
    <div className="space-y-4 pt-4 px-2">
      {!createFromTemplate && (
        <Controller
          name="isTemplate"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} data-disabled={isEditMode}>
              <FieldLabel className="mb-2 block">Tipo</FieldLabel>
              <RadioGroup
                value={field.value ? "plantilla" : "planificacion"}
                onValueChange={(value) => field.onChange(value === "plantilla")}
                disabled={isEditMode}
                className="grid grid-cols-2 gap-3"
              >
                <FieldLabel asChild>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      (!field.value && "border-primary ring-1 ring-primary") ||
                        "border-input",
                      isEditMode &&
                        "pointer-events-none cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">Planificación</span>
                      <span className="block text-sm text-muted-foreground">
                        Planificación de entrenamientos.
                      </span>
                    </span>
                    <RadioGroupItem
                      value="planificacion"
                      id="isTemplate-planificacion"
                      className="mt-0.5 shrink-0"
                      aria-invalid={fieldState.invalid}
                    />
                  </label>
                </FieldLabel>
                <FieldLabel asChild>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      (field.value && "border-primary ring-1 ring-primary") ||
                        "border-input",
                      isEditMode &&
                        "pointer-events-none cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">Plantilla</span>
                      <span className="block text-sm text-muted-foreground">
                        Plantilla reutilizable.
                      </span>
                    </span>
                    <RadioGroupItem
                      value="plantilla"
                      id="isTemplate-plantilla"
                      className="mt-0.5 shrink-0"
                      aria-invalid={fieldState.invalid}
                    />
                  </label>
                </FieldLabel>
              </RadioGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      )}

      {templateSelectorNode}

      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Nombre *</FieldLabel>
            <Input
              {...field}
              id={field.name}
              aria-invalid={fieldState.invalid}
              placeholder="Ej: Rutina de hipertrofia 12 semanas"
              autoComplete="off"
            />
            <FieldDescription>
              Proporciona un nombre descriptivo para la planificación.
            </FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <Controller
        name="description"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Descripción</FieldLabel>
            <Textarea
              {...field}
              id={field.name}
              aria-invalid={fieldState.invalid}
              placeholder="Describe el objetivo y contenido de esta planificación..."
              rows={3}
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {!isTemplate && (
        <Controller
          name="folderId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Carpeta</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={field.name}
                  readOnly
                  aria-invalid={fieldState.invalid}
                  className="flex-1 min-w-0 bg-muted"
                  value={
                    field.value
                      ? (folders?.find(
                          (f: Doc<"folders">) => f._id === field.value,
                        )?.path ?? field.value)
                      : "Sin carpeta"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setFolderPickerOpen(true)}
                  aria-label="Abrir selector de carpeta"
                >
                  <FolderOpen className="h-4 w-4" />
                  Seleccionar carpeta
                </Button>
              </div>
              <Dialog
                open={folderPickerOpen}
                onOpenChange={setFolderPickerOpen}
              >
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Seleccionar carpeta</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto py-2">
                    <FolderTree
                      folders={folders ?? []}
                      selectedId={field.value ?? null}
                      onSelect={(id) => {
                        field.onChange(id ?? undefined);
                        setFolderPickerOpen(false);
                      }}
                      showCreateDialog={false}
                      setShowCreateDialog={() => {}}
                      rootLabel="Sin carpeta"
                      disableCreate
                    />
                  </div>
                </DialogContent>
              </Dialog>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      )}
    </div>
  );

  if (!showCollapsibleIcon) {
    return (
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Información básica</h2>
        {formContent}
      </div>
    );
  }

  return (
    <Collapsible defaultOpen>
      <div className="rounded-lg border p-6 space-y-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between text-left font-semibold hover:opacity-80 transition-opacity"
          >
            <h2 className="text-lg font-semibold">Información básica</h2>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 duration-200">
          {formContent}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
