'use client'

import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { type Id, type Doc } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { mapMembershipsToMembers } from '@repo/core/utils'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

const DAYS = [
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
  { label: 'Domingo', value: 0 },
]

const MINUTES_OPTIONS = [0, 15, 30, 45]

export type ModelWeekSlotDoc = Doc<'modelWeekSlots'> & {
  class: Doc<'classes'> | null
}

interface ModelWeekSlotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the dialog is in edit mode. */
  slot?: ModelWeekSlotDoc
  /** Pre-fill when creating from a grid cell click. */
  initialDayOfWeek?: number
  initialStartTimeMinutes?: number
  classes: Doc<'classes'>[]
  onSuccess?: () => void
}

export default function ModelWeekSlotDialog({
  open,
  onOpenChange,
  slot,
  initialDayOfWeek,
  initialStartTimeMinutes,
  classes,
  onSuccess,
}: ModelWeekSlotDialogProps) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const isEditing = !!slot

  // Slot form state
  const createSlot = useMutation(api.modelWeekSlots.create)
  const updateSlot = useMutation(api.modelWeekSlots.update)
  const removeSlot = useMutation(api.modelWeekSlots.remove)

  const [classId, setClassId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [capacity, setCapacity] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // Tab state (only relevant when editing)
  const [activeTab, setActiveTab] = useState<'slot' | 'members'>('slot')

  // Members tab state
  const createFixedSlot = useMutation(api.fixedClassSlots.create)
  const removeFixedSlot = useMutation(api.fixedClassSlots.remove)
  const [memberSearchOpen, setMemberSearchOpen] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)

  const slotMembers = useQuery(
    api.fixedClassSlots.listBySlot,
    isEditing && open && canQueryCurrentOrganization
      ? {
          classId: slot.classId,
          dayOfWeek: slot.dayOfWeek,
          startTimeMinutes: slot.startTimeMinutes,
        }
      : 'skip'
  )

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    isEditing && open && canQueryCurrentOrganization ? {} : 'skip'
  )

  const allMembers = useMemo(
    () =>
      memberships
        ? mapMembershipsToMembers(memberships).filter(
            (m) => m.role?.toLowerCase() === 'member' || m.role?.toLowerCase() === 'miembro'
          )
        : [],
    [memberships]
  )

  const assignedUserIds = useMemo(
    () => new Set(slotMembers?.map((s) => s.userId) ?? []),
    [slotMembers]
  )

  const availableMembers = useMemo(
    () => allMembers.filter((m) => !assignedUserIds.has(m.id)),
    [allMembers, assignedUserIds]
  )

  useEffect(() => {
    if (!open) return
    if (slot) {
      setClassId(slot.classId)
      setDayOfWeek(slot.dayOfWeek)
      setHour(Math.floor(slot.startTimeMinutes / 60))
      setMinute(slot.startTimeMinutes % 60)
      setDurationMinutes(slot.durationMinutes)
      setCapacity(slot.capacity != null ? String(slot.capacity) : '')
      setNotes(slot.notes ?? '')
    } else {
      setClassId('')
      setDayOfWeek(initialDayOfWeek ?? 1)
      setHour(
        initialStartTimeMinutes !== undefined
          ? Math.floor(initialStartTimeMinutes / 60)
          : 9
      )
      setMinute(
        initialStartTimeMinutes !== undefined
          ? initialStartTimeMinutes % 60
          : 0
      )
      setDurationMinutes(60)
      setCapacity('')
      setNotes('')
    }
    setActiveTab('slot')
    setSelectedMemberIds([])
    setMemberSearchOpen(false)
  }, [open, slot, initialDayOfWeek, initialStartTimeMinutes])

  const handleSubmit = async () => {
    if (!classId) {
      toast.error('Seleccioná una clase')
      return
    }
    if (durationMinutes < 5) {
      toast.error('La duración mínima es 5 minutos')
      return
    }

    const startTimeMinutes = hour * 60 + minute
    const capacityValue = capacity ? Number(capacity) : undefined

    setLoading(true)
    try {
      if (isEditing) {
        await updateSlot({
          id: slot._id,
          classId: classId as Id<'classes'>,
          dayOfWeek,
          startTimeMinutes,
          durationMinutes,
          capacity: capacityValue,
          notes: notes || undefined,
        })
        toast.success('Slot actualizado')
      } else {
        await createSlot({
          classId: classId as Id<'classes'>,
          dayOfWeek,
          startTimeMinutes,
          durationMinutes,
          capacity: capacityValue,
          notes: notes || undefined,
        })
        toast.success('Slot creado')
      }
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!slot) return
    setLoading(true)
    try {
      await removeSlot({ id: slot._id })
      toast.success('Slot eliminado')
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMembers = async () => {
    if (selectedMemberIds.length === 0 || !slot) return
    const timezone =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined

    setAddingMembers(true)
    try {
      for (const userId of selectedMemberIds) {
        await createFixedSlot({
          userId,
          classId: slot.classId,
          dayOfWeek: slot.dayOfWeek,
          startTimeMinutes: slot.startTimeMinutes,
          timezone,
        })
      }
      toast.success(
        selectedMemberIds.length === 1
          ? 'Miembro agregado'
          : `${selectedMemberIds.length} miembros agregados`
      )
      setSelectedMemberIds([])
      setMemberSearchOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar')
    } finally {
      setAddingMembers(false)
    }
  }

  const handleRemoveMember = async (id: Id<'fixedClassSlots'>) => {
    try {
      await removeFixedSlot({ id })
      toast.success('Miembro eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const slotFormContent = (
    <div className="space-y-4">
      {/* Class */}
      <Field>
        <FieldLabel>Clase</FieldLabel>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccioná una clase" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Day */}
      <Field>
        <FieldLabel>Día</FieldLabel>
        <Select
          value={String(dayOfWeek)}
          onValueChange={(v) => setDayOfWeek(Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((d) => (
              <SelectItem key={d.value} value={String(d.value)}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Time */}
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Hora</FieldLabel>
          <Select
            value={String(hour)}
            onValueChange={(v) => setHour(Number(v))}
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
        </Field>

        <Field>
          <FieldLabel>Minutos</FieldLabel>
          <Select
            value={String(minute)}
            onValueChange={(v) => setMinute(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTES_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m.toString().padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Duration */}
      <Field>
        <FieldLabel>Duración (minutos)</FieldLabel>
        <Input
          type="number"
          min={5}
          max={480}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
        />
      </Field>

      {/* Capacity override */}
      <Field>
        <FieldLabel>Capacidad (opcional)</FieldLabel>
        <Input
          type="number"
          min={1}
          placeholder="Usa la capacidad de la clase"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <FieldDescription>
          Si lo dejás vacío se usa la capacidad definida en la clase.
        </FieldDescription>
      </Field>

      {/* Notes */}
      <Field>
        <FieldLabel>Notas (opcional)</FieldLabel>
        <Textarea
          rows={2}
          placeholder="Notas adicionales..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {isEditing && (
        <>
          <Separator />
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={handleDelete}
            disabled={loading}
          >
            Eliminar slot
          </Button>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {isEditing ? 'Guardar cambios' : 'Crear slot'}
        </Button>
      </div>
    </div>
  )

  const membersTabContent = (
    <div className="space-y-4">
      {/* Add members */}
      <div className="flex gap-2">
        <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={memberSearchOpen}
              className={cn(
                'flex-1 justify-between',
                selectedMemberIds.length === 0 && 'text-muted-foreground'
              )}
              type="button"
            >
              {selectedMemberIds.length === 0
                ? 'Seleccionar miembros'
                : selectedMemberIds.length === 1
                  ? (allMembers.find((m) => m.id === selectedMemberIds[0])?.name ??
                    '1 miembro')
                  : `${selectedMemberIds.length} miembros`}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar miembro..." />
              <CommandList>
                <CommandEmpty>
                  {availableMembers.length === 0 && allMembers.length > 0
                    ? 'Todos los miembros ya están asignados.'
                    : 'No se encontraron miembros.'}
                </CommandEmpty>
                <CommandGroup>
                  {availableMembers.map((member) => {
                    const isSelected = selectedMemberIds.includes(member.id)
                    return (
                      <CommandItem
                        key={member.id}
                        value={`${member.name} ${member.email ?? ''}`}
                        onSelect={() => {
                          setSelectedMemberIds((prev) =>
                            isSelected
                              ? prev.filter((id) => id !== member.id)
                              : [...prev, member.id]
                          )
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="pointer-events-none mr-2"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {member.name}
                          </span>
                          {member.email && (
                            <span className="truncate text-xs text-muted-foreground">
                              {member.email}
                            </span>
                          )}
                        </div>
                        <Check
                          className={cn(
                            'ml-2 h-4 w-4',
                            isSelected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          onClick={handleAddMembers}
          disabled={selectedMemberIds.length === 0 || addingMembers}
        >
          Agregar
        </Button>
      </div>

      {/* Current members list */}
      <div className="rounded-lg border">
        {slotMembers === undefined ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando...</p>
        ) : slotMembers.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            No hay miembros con turno fijo en este slot.
          </p>
        ) : (
          <ul className="divide-y">
            {slotMembers.map((s) => (
              <li
                key={s._id}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm">{s.userFullName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveMember(s._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar slot del modelo' : 'Nuevo slot del modelo'}
          </DialogTitle>
          <DialogDescription>
            Define cuándo se dicta una clase en la semana modelo.
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'slot' | 'members')}
          >
            <TabsList className="w-full">
              <TabsTrigger value="slot" className="flex-1">
                Slot
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1">
                Miembros fijos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="slot" className="mt-4">
              {slotFormContent}
            </TabsContent>
            <TabsContent value="members" className="mt-4">
              {membersTabContent}
            </TabsContent>
          </Tabs>
        ) : (
          slotFormContent
        )}
      </DialogContent>
    </Dialog>
  )
}
