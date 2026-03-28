'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { Badge } from '@/components/ui/badge'
import StatusBadge from '@/components/shared/badges/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { Member } from '@repo/core'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import {
  Eye,
  Users,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react'

import { useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

import PlanCalendar from '@/components/ui/plancalendar'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
]

type Props = {
  member: Member | null
  open: boolean
  onClose: () => void
}

function safeDate(value: any): Date | null {
  if (!value) return null

  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.split('/')
    if (parts.length === 3) {
      const [day, month, year] = parts
      const parsed = new Date(`${year}-${month}-${day}`)
      return isNaN(parsed.getTime()) ? null : parsed
    }
  }

  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export default function MemberDetailDialog({ member, open, onClose }: Props) {
  const router = useRouter()

  const [addFixedSlotOpen, setAddFixedSlotOpen] = useState(false)
  const [addClassId, setAddClassId] = useState<Id<'classes'> | ''>('')
  const [addDayOfWeek, setAddDayOfWeek] = useState<number>(1)
  const [addHour, setAddHour] = useState(9)
  const [addMinute, setAddMinute] = useState(0)

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    member && open ? { userId: member.id } : 'skip'
  )

  const fixedSlots = useQuery(
    api.fixedClassSlots.listByUser,
    member && open ? { userId: member.id } : 'skip'
  )

  const classes = useQuery(api.classes.getByOrganization, {
    activeOnly: false,
  })

  const createFixedSlot = useMutation(api.fixedClassSlots.create)
  const removeFixedSlot = useMutation(api.fixedClassSlots.remove)

  if (!member) return null

  const assignment = assignments?.find(
    (
      a: Doc<'planificationAssignments'> & {
        planification?: { _id: Id<'planifications'> } | null
      }
    ) => a.status === 'active'
  )

  const initials =
    member.fullName
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    member.email?.[0]?.toUpperCase() ||
    '?'

  const handleViewPlan = () => {
    if (!assignment?.planification?._id) return
    router.push(`/dashboard/planifications/${assignment.planification._id}`)
  }

  const handleAssign = () => {
    router.push('/dashboard/planifications')
  }

  const handleAddFixedSlot = async () => {
    if (!addClassId) {
      toast.error('Seleccioná una clase')
      return
    }

    const startTimeMinutes = addHour * 60 + addMinute
    const timezone =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined

    try {
      await createFixedSlot({
        userId: member.id,
        classId: addClassId as Id<'classes'>,
        dayOfWeek: addDayOfWeek,
        startTimeMinutes,
        timezone,
      })

      toast.success('Turno fijo agregado')
      setAddFixedSlotOpen(false)
      setAddClassId('')
      setAddDayOfWeek(1)
      setAddHour(9)
      setAddMinute(0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al agregar turno fijo')
    }
  }

  const handleRemoveFixedSlot = async (id: Id<'fixedClassSlots'>) => {
    try {
      await removeFixedSlot({ id })
      toast.success('Turno fijo eliminado')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  const formatSlotTime = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const birthDate = safeDate(member.birthDate)

  const age = (() => {
    if (!birthDate) return null
    const today = new Date()
    let years = today.getFullYear() - birthDate.getFullYear()

    const hasHadBirthdayThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate())

    if (!hasHadBirthdayThisYear) years--
    return years
  })()

  const planStatus = (() => {
    if (!assignment) return null

    const start = safeDate(assignment.startDate)
    const end = safeDate(assignment.endDate)

    if (!start || !end) return null

    const now = new Date()

    const diffDays = (from: Date, to: Date) =>
      Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))

    if (end <= now) {
      return {
        status: 'expired' as const,
        daysLeft: 0,
      }
    }

    if (start > now) {
      return {
        status: 'not_started' as const,
        daysLeft: diffDays(now, end),
      }
    }

    const daysLeft = Math.max(diffDays(now, end), 0)

    if (daysLeft <= 5) {
      return {
        status: 'expiring_soon' as const,
        daysLeft,
      }
    }

    return {
      status: 'active' as const,
      daysLeft,
    }
  })()

  const showAssignButton = !assignment || planStatus?.status === 'expired'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="top-[max(1rem,env(safe-area-inset-top))] max-h-[88vh] w-[min(96vw,32rem)] translate-y-0 overflow-y-auto rounded-lg p-4 pt-8 sm:top-[50%] sm:max-h-[90vh] sm:w-full sm:max-w-5xl sm:translate-y-[-50%] sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Detalle del miembro</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
          {/* LEFT */}
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16">
                {member.imageUrl && <AvatarImage src={member.imageUrl} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold sm:text-xl">
                  {member.name}
                </p>

                {member.email && (
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email}
                  </p>
                )}

                {member.username && (
                  <p className="text-xs text-muted-foreground">
                    @{member.username}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Estado</p>
                <StatusBadge
                  status={
                    member.status?.toLowerCase() === 'activo'
                      ? 'active'
                      : member.status?.toLowerCase() ?? 'inactive'
                  }
                />
              </div>

              <div>
                <p className="text-muted-foreground">Miembro desde</p>
                <p>
                  {safeDate(member.joinedAt)
                    ? format(safeDate(member.joinedAt)!, 'd MMM yyyy', {
                        locale: es,
                      })
                    : '-'}
                </p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Fecha de nacimiento</p>
                <p>
                  {birthDate && age !== null
                    ? `${format(birthDate, 'dd/MM/yyyy')} (${age} años)`
                    : '-'}
                </p>
              </div>
            </div>

            {/* TURNOS */}
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Turnos fijos</p>

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 self-start sm:self-auto"
                  onClick={() => setAddFixedSlotOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Agregar turno fijo
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                {fixedSlots === undefined ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : fixedSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin turnos fijos. El miembro se agregará automáticamente a
                    cada clase que coincida con el horario asignado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {fixedSlots.length} turno{fixedSlots.length === 1 ? '' : 's'}
                    </p>

                    <div className="h-[108px] overflow-y-auto pr-1 sm:pr-2">
                      <ul className="space-y-1.5">
                        {fixedSlots.map(
                          (
                            slot: Doc<'fixedClassSlots'> & {
                              className?: string | null
                            }
                          ) => (
                            <li
                              key={slot._id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2 text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium leading-none">
                                  {slot.className ?? '-'}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {DAYS_OF_WEEK.find(
                                    (d) => d.value === slot.dayOfWeek
                                  )?.label ?? slot.dayOfWeek}{' '}
                                  {formatSlotTime(slot.startTimeMinutes)}
                                </p>
                              </div>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 shrink-0 p-0 text-destructive/80 hover:text-destructive"
                                onClick={() => handleRemoveFixedSlot(slot._id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-4 rounded-lg border p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                {assignment ? (
                  <>
                    <div className="truncate font-semibold">
                      {assignment.planification?.name}
                    </div>

                    {planStatus && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {planStatus.status === 'active' && (
                          <>
                            <Badge className="bg-green-500/20 text-green-400 border border-green-500/40">
                              Activa
                            </Badge>
                            <Badge variant="secondary">
                              {planStatus.daysLeft} día
                              {planStatus.daysLeft !== 1 && 's'} restantes
                            </Badge>
                          </>
                        )}

                        {planStatus.status === 'expiring_soon' && (
                          <>
                            <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                              Por vencer
                            </Badge>
                            <Badge variant="secondary">
                              {planStatus.daysLeft} día
                              {planStatus.daysLeft !== 1 && 's'} restantes
                            </Badge>
                          </>
                        )}

                        {planStatus.status === 'expired' && (
                          <Badge className="bg-red-500/20 text-red-400 border border-red-500/40">
                            Vencida
                          </Badge>
                        )}

                        {planStatus.status === 'not_started' && (
                          <Badge variant="secondary">No iniciada</Badge>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <Badge variant="secondary">Sin planificación</Badge>
                )}
              </div>

              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                {assignment && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleViewPlan}
                    className="w-full sm:w-auto"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                )}

                {showAssignButton && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAssign}
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <Users className="h-4 w-4" />
                    Asignar
                  </Button>
                )}
              </div>
            </div>

            <div className="flex min-h-[200px] flex-1 items-start justify-center overflow-x-auto rounded-md bg-muted/20 p-2 sm:min-h-[220px] sm:p-3">
              {assignment?.startDate && assignment?.endDate ? (
                <PlanCalendar
                  startDate={safeDate(assignment.startDate)!}
                  endDate={safeDate(assignment.endDate)!}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Sin planificación activa
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* ADD FIXED SLOT DIALOG */}
      <Dialog open={addFixedSlotOpen} onOpenChange={setAddFixedSlotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar turno fijo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
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
              <Label>Día</Label>
              <Select
                value={String(addDayOfWeek)}
                onValueChange={(v) => setAddDayOfWeek(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button
                variant="outline"
                onClick={() => setAddFixedSlotOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleAddFixedSlot}>Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
