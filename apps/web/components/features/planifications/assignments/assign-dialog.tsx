'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

interface AssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planificationId: string
}

export default function AssignDialog({
  open,
  onOpenChange,
  planificationId,
}: AssignDialogProps) {
  const assign = useMutation(api.planificationAssignments.assign)
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) return

    setLoading(true)
    try {
      await assign({
        planificationId: planificationId as any,
        userId: selectedUserId,
        startDate: startDate ? new Date(startDate).getTime() : undefined,
        endDate: endDate ? new Date(endDate).getTime() : undefined,
        notes: notes.trim() || undefined,
      })

      // Reset form
      setSelectedUserId('')
      setStartDate('')
      setEndDate('')
      setNotes('')
      onOpenChange(false)
    } catch (error: any) {
      console.error('Failed to assign:', error)
      alert(error.message || 'Error al asignar planificación')
    } finally {
      setLoading(false)
    }
  }

  const members = memberships?.filter((m) => m.role === 'member') || []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Asignar planificación</SheetTitle>
          <SheetDescription>
            Asigna esta planificación a un miembro
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member">Miembro *</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar miembro" />
              </SelectTrigger>
              <SelectContent>
                {members.map((membership) => (
                  <SelectItem key={membership.userId} value={membership.userId}>
                    <div className="flex items-center gap-2">
                      {membership.fullName || membership.email || 'Usuario'}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Fecha fin</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas o instrucciones especiales..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading || !selectedUserId}>
              {loading ? 'Asignando...' : 'Asignar'}
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
