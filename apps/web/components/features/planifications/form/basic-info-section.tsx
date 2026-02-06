'use client'

import { Controller, UseFormReturn } from 'react-hook-form'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface BasicInfoSectionProps {
  form: UseFormReturn<any>
}

export default function BasicInfoSection({ form }: BasicInfoSectionProps) {
  const folders = useQuery(api.folders.getTree)

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

        <CollapsibleContent
          className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 duration-200"
        >
          <div className="space-y-4 pt-4 px-2">
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

            <Controller
              name="folderId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Carpeta</FieldLabel>
                  <Select
                    value={field.value || 'root'}
                    onValueChange={(v) => field.onChange(v === 'root' ? undefined : v)}
                  >
                    <SelectTrigger id={field.name} aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Seleccionar carpeta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Sin carpeta</SelectItem>
                      {folders?.map((folder) => (
                        <SelectItem key={folder._id} value={folder._id}>
                          {folder.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="isTemplate"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldLabel
                    htmlFor={field.name}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Marcar como plantilla reutilizable
                  </FieldLabel>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
