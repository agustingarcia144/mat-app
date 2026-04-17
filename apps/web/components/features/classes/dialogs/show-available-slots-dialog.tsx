'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { type Doc } from '@/convex/_generated/dataModel'
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
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Field, FieldLabel } from '@/components/ui/field'
import { Copy, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

const DAYS_ORDER = [
  { value: 1, label: 'lunes' },
  { value: 2, label: 'martes' },
  { value: 3, label: 'miércoles' },
  { value: 4, label: 'jueves' },
  { value: 5, label: 'viernes' },
  { value: 6, label: 'sábado' },
  { value: 0, label: 'domingo' },
]

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

interface ShowAvailableSlotsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type EnrichedSlot = Doc<'modelWeekSlots'> & {
  class: Doc<'classes'> | null
}

export default function ShowAvailableSlotsDialog({
  open,
  onOpenChange,
}: ShowAvailableSlotsDialogProps) {
  const canQueryOrgData = useCanQueryCurrentOrganization()

  // Filters
  const [classFilter, setClassFilter] = useState<string>('all')
  const [trainerFilter, setTrainerFilter] = useState<string>('all')
  const [showAvailableSpots, setShowAvailableSpots] = useState(false)
  const [showTrainers, setShowTrainers] = useState(true)
  const [hasSearched, setHasSearched] = useState(false)

  // Data queries
  const modelWeekSlots = useQuery(
    api.modelWeekSlots.listByOrganization,
    open && canQueryOrgData ? {} : 'skip'
  )

  const classes = useQuery(
    api.classes.getByOrganization,
    open && canQueryOrgData ? { activeOnly: true } : 'skip'
  )

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    open && canQueryOrgData ? {} : 'skip'
  )

  // Build trainers map: userId -> name
  const trainersMap = useMemo(() => {
    const map = new Map<string, string>()
    memberships?.forEach(
      (m: {
        role: string
        userId: string
        fullName?: string
        email?: string
      }) => {
        if (m.role === 'trainer') {
          map.set(m.userId, m.fullName || m.email || 'Entrenador')
        }
      }
    )
    return map
  }, [memberships])

  // Unique trainers that actually have classes assigned
  const availableTrainers = useMemo(() => {
    if (!classes) return []
    const trainerIds = new Set<string>()
    classes.forEach((c: Doc<'classes'>) => {
      if (c.trainerId) trainerIds.add(c.trainerId)
    })
    return Array.from(trainerIds).map((id) => ({
      id,
      name: trainersMap.get(id) || 'Entrenador',
    }))
  }, [classes, trainersMap])

  // Filter and sort slots
  const filteredSlots = useMemo(() => {
    if (!modelWeekSlots || !hasSearched) return []

    let slots = modelWeekSlots as EnrichedSlot[]

    // Filter by class
    if (classFilter !== 'all') {
      slots = slots.filter((s) => s.classId === classFilter)
    }

    // Filter by trainer
    if (trainerFilter !== 'all') {
      slots = slots.filter((s) => s.class?.trainerId === trainerFilter)
    }

    // Sort by day of week (Mon first), then by time
    const dayOrder = [1, 2, 3, 4, 5, 6, 0] // Mon-Sun
    return [...slots].sort((a, b) => {
      const dayA = dayOrder.indexOf(a.dayOfWeek)
      const dayB = dayOrder.indexOf(b.dayOfWeek)
      if (dayA !== dayB) return dayA - dayB
      return a.startTimeMinutes - b.startTimeMinutes
    })
  }, [modelWeekSlots, classFilter, trainerFilter, hasSearched])

  // Generate text for display and clipboard
  const generateText = useCallback(
    (slots: EnrichedSlot[]): string => {
      return slots
        .map((slot) => {
          const dayLabel =
            DAYS_ORDER.find((d) => d.value === slot.dayOfWeek)?.label ?? ''
          const time = formatMinutes(slot.startTimeMinutes)
          const className = slot.class?.name ?? 'Clase'

          let line = `${dayLabel} ${time} - ${className}`

          if (showAvailableSpots) {
            const capacity = slot.capacity ?? slot.class?.capacity ?? 0
            line += ` (${capacity} lugares)`
          }

          if (showTrainers && slot.class?.trainerId) {
            const trainerName =
              trainersMap.get(slot.class.trainerId) ?? 'Entrenador'
            line += ` - ${trainerName}`
          }

          return line
        })
        .join('\n')
    },
    [showTrainers, showAvailableSpots, trainersMap]
  )

  const displayText = useMemo(
    () => generateText(filteredSlots),
    [filteredSlots, generateText]
  )

  const handleSearch = () => {
    setHasSearched(true)
  }

  const handleCopyToClipboard = async () => {
    if (!displayText) return
    try {
      await navigator.clipboard.writeText(displayText)
      toast.success('Copiado al portapapeles')
    } catch {
      toast.error('Error al copiar')
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset state when closing
    setClassFilter('all')
    setTrainerFilter('all')
    setShowAvailableSpots(false)
    setShowTrainers(true)
    setHasSearched(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Muestra turnos disponibles</DialogTitle>
          <DialogDescription>
            Genera un listado de turnos de la semana modelo para enviar a
            clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/* Filters panel */}
          <div className="w-full shrink-0 space-y-4 md:w-64">
            {/* Class filter */}
            <Field>
              <FieldLabel>Actividad</FieldLabel>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {classes?.map((c: Doc<'classes'>) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Trainer filter */}
            <Field>
              <FieldLabel>Profesional</FieldLabel>
              <Select value={trainerFilter} onValueChange={setTrainerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableTrainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Checkboxes */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showAvailableSpots}
                  onCheckedChange={(checked) =>
                    setShowAvailableSpots(checked === true)
                  }
                />
                Muestra cantidad de lugares disponibles
              </label>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showTrainers}
                  onCheckedChange={(checked) =>
                    setShowTrainers(checked === true)
                  }
                />
                Mostrar profesionales
              </label>
            </div>

            {/* Search button */}
            <Button onClick={handleSearch} className="w-full gap-2">
              <Search className="h-4 w-4" />
              Buscar
            </Button>
          </div>

          {/* Results panel */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Quick copy icon button - top-right corner of the results area */}
            {hasSearched && filteredSlots.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10 h-8 w-8"
                onClick={handleCopyToClipboard}
                title="Copiar al portapapeles"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}

            {/* Slots list */}
            <ScrollArea className="h-full max-h-[50vh] flex-1 rounded-md border p-3 pr-10">
              {!hasSearched ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Configurá los filtros y presioná &quot;Buscar&quot; para ver
                  los turnos disponibles.
                </p>
              ) : filteredSlots.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No se encontraron turnos con los filtros seleccionados.
                </p>
              ) : (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                  {displayText}
                </pre>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
