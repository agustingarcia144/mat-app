'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { useAuth } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { Clock, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

const normalize = (v?: string) => v?.toString().trim().toLowerCase() ?? ''

function formatSlotTime(startTimeMinutes: number) {
  const h = Math.floor(startTimeMinutes / 60)
  const m = startTimeMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function FixedSlotsDialog({ open, onOpenChange }: Props) {
  const { orgId } = useAuth()
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const [classFilter, setClassFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [addUserId, setAddUserId] = useState<string>('')
  const [addClassId, setAddClassId] = useState<Id<'classes'> | ''>('')
  const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([1])
  const [addHour, setAddHour] = useState(9)
  const [addMinute, setAddMinute] = useState(0)

  const fixedSlots = useQuery(
    api.fixedClassSlots.listByOrganizationAndClass,
    open && canQueryCurrentOrganization
      ? { classId: classFilter === 'all' ? undefined : (classFilter as Id<'classes'>) }
      : 'skip'
  )
  const classes = useQuery(
    api.classes.getByOrganization,
    open && canQueryCurrentOrganization ? { activeOnly: false } : 'skip'
  )
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQueryCurrentOrganization && orgId
      ? { organizationExternalId: orgId }
      : 'skip'
  )
  const createFixedSlot = useMutation(api.fixedClassSlots.create)
  const removeFixedSlot = useMutation(api.fixedClassSlots.remove)
  const backfillToExisting = useMutation(
    api.fixedClassSlots.backfillToExistingSchedules
  )
  const [backfilling, setBackfilling] = useState(false)

  const members = memberships
    ? mapMembershipsToMembers(memberships).filter(
        (m) => normalize(m.role) === 'member' || normalize(m.role) === 'miembro'
      )
    : []

  const handleAdd = async () => {
    if (!addUserId || !addClassId) {
      toast.error('Seleccioná miembro y clase')
      return
    }
    if (addDaysOfWeek.length === 0) {
      toast.error('Seleccioná al menos un día')
      return
    }
    const startTimeMinutes = addHour * 60 + addMinute
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
    try {
      for (const dayOfWeek of addDaysOfWeek) {
        await createFixedSlot({
          userId: addUserId,
          classId: addClassId as Id<'classes'>,
          dayOfWeek,
          startTimeMinutes,
          timezone,
        })
      }
      toast.success(
        addDaysOfWeek.length === 1
          ? 'Turno fijo agregado'
          : `${addDaysOfWeek.length} turnos fijos agregados`
      )
      setAddOpen(false)
      setAddUserId('')
      setAddClassId('')
      setAddDaysOfWeek([1])
      setAddHour(9)
      setAddMinute(0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar turno fijo')
    }
  }

  const handleRemove = async (id: Id<'fixedClassSlots'>) => {
    try {
      await removeFixedSlot({ id })
      toast.success('Turno fijo eliminado')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const timezone =
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined
      const result = await backfillToExisting({ timezone })
      toast.success(
        result.processedSlots === 0
          ? 'No hay turnos fijos para aplicar'
          : `Se aplicaron los turnos fijos a los horarios existentes (${result.processedSlots} turno${result.processedSlots === 1 ? '' : 's'} fijo${result.processedSlots === 1 ? '' : 's'})`
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al aplicar')
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Miembros con turno fijo
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-muted-foreground">Filtrar por clase:</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las clases</SelectItem>
                  {classes?.map((c: Doc<'classes'>) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleBackfill}
                disabled={backfilling || (fixedSlots?.length ?? 0) === 0}
                title="Aplicar miembros con turno fijo a los horarios ya creados"
              >
                <RefreshCw
                  className={`h-4 w-4 ${backfilling ? 'animate-spin' : ''}`}
                />
                Aplicar a turnos existentes
              </Button>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>

            <div className="border rounded-lg overflow-auto flex-1 min-h-[200px]">
              {fixedSlots === undefined ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Cargando…
                </div>
              ) : fixedSlots.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No hay turnos fijos. Agregá miembros con turno fijo para que
                  se asignen automáticamente a cada clase que coincida con el
                  horario.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Miembro</th>
                      <th className="text-left p-3 font-medium">Clase</th>
                      <th className="text-left p-3 font-medium">Día</th>
                      <th className="text-left p-3 font-medium">Hora</th>
                      <th className="w-10 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {fixedSlots.map((slot: Doc<'fixedClassSlots'> & { className: string | null; userFullName: string }) => (
                      <tr
                        key={slot._id}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="p-3">{slot.userFullName ?? slot.userId}</td>
                        <td className="p-3">{slot.className ?? '-'}</td>
                        <td className="p-3">
                          {DAYS_OF_WEEK.find((d) => d.value === slot.dayOfWeek)
                            ?.label ?? slot.dayOfWeek}
                        </td>
                        <td className="p-3 flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatSlotTime(slot.startTimeMinutes)}
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleRemove(slot._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add fixed slot dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar turno fijo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Miembro</Label>
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar miembro" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Clase</Label>
              <Select
                value={addClassId}
                onValueChange={(v) => setAddClassId(v as Id<'classes'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar clase" />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c: Doc<'classes'>) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Días</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`add-dow-${day.value}`}
                      checked={addDaysOfWeek.includes(day.value)}
                      onCheckedChange={(checked) => {
                        setAddDaysOfWeek((prev) =>
                          checked
                            ? [...prev, day.value].sort((a, b) => a - b)
                            : prev.filter((d) => d !== day.value)
                        )
                      }}
                    />
                    <Label
                      htmlFor={`add-dow-${day.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora</Label>
                <Select
                  value={String(addHour)}
                  onValueChange={(v) => setAddHour(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Minutos</Label>
                <Select
                  value={String(addMinute)}
                  onValueChange={(v) => setAddMinute(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 15, 30, 45].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        :{m.toString().padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAdd}>Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
