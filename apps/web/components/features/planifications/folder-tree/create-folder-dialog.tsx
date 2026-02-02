'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentId?: string
}

export default function CreateFolderDialog({
  open,
  onOpenChange,
  parentId,
}: CreateFolderDialogProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const createFolder = useMutation(api.folders.create)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      await createFolder({
        name: name.trim(),
        parentId: parentId as any,
      })
      setName('')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create folder:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nueva carpeta</SheetTitle>
          <SheetDescription>
            Crea una carpeta para organizar tus planificaciones
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Nombre de la carpeta
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Principiantes, Avanzados..."
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Creando...' : 'Crear carpeta'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
