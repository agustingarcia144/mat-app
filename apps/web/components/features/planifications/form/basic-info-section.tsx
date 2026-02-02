'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

interface BasicInfoSectionProps {
  name: string
  setName: (value: string) => void
  description: string
  setDescription: (value: string) => void
  folderId?: string
  setFolderId: (value: string | undefined) => void
  isTemplate: boolean
  setIsTemplate: (value: boolean) => void
}

export default function BasicInfoSection({
  name,
  setName,
  description,
  setDescription,
  folderId,
  setFolderId,
  isTemplate,
  setIsTemplate,
}: BasicInfoSectionProps) {
  const folders = useQuery(api.folders.getTree)

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h2 className="text-lg font-semibold">Información básica</h2>

      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Rutina de hipertrofia 12 semanas"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el objetivo y contenido de esta planificación..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="folder">Carpeta</Label>
        <Select
          value={folderId || 'root'}
          onValueChange={(v) => setFolderId(v === 'root' ? undefined : v)}
        >
          <SelectTrigger>
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
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="template"
          checked={isTemplate}
          onCheckedChange={(checked: boolean) =>
            setIsTemplate(checked === true)
          }
        />
        <Label
          htmlFor="template"
          className="text-sm font-normal cursor-pointer"
        >
          Marcar como plantilla reutilizable
        </Label>
      </div>
    </div>
  )
}
