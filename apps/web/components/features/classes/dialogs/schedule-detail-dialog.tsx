'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'
import { type Id } from '@/convex/_generated/dataModel'
import ClassStatusBadge from '@/components/shared/badges/class-status-badge'
import { toast } from 'sonner'

interface ScheduleDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduleId: Id<'classSchedules'>
}

export default function ScheduleDetailDialog({
  open,
  onOpenChange,
  scheduleId,
}: ScheduleDetailDialogProps) {
  const schedule = useQuery(api.classSchedules.getScheduleWithDetails, {
    id: scheduleId,
  })
  const reservations = useQuery(api.classReservations.getByScheduleWithUsers, {
    scheduleId,
  })
  const checkIn = useMutation(api.classReservations.checkIn)
  const markNoShow = useMutation(api.classReservations.markNoShow)
  const cancelSchedule = useMutation(api.classSchedules.cancel)

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const filteredReservations =
    !schedule || !reservations
      ? []
      : statusFilter === 'all'
        ? reservations
        : reservations.filter((r) => r.status === statusFilter)

  const confirmedCount = reservations
    ? reservations.filter((r) => r.status === 'confirmed').length
    : 0
  const attendedCount = reservations
    ? reservations.filter((r) => r.status === 'attended').length
    : 0
  const noShowCount = reservations
    ? reservations.filter((r) => r.status === 'no_show').length
    : 0

  const handleCheckIn = async (reservationId: Id<'classReservations'>) => {
    setActionLoading(reservationId)
    try {
      await checkIn({ id: reservationId })
    } catch (error) {
      console.error('Error checking in:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al registrar asistencia'
      )
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkNoShow = async (reservationId: Id<'classReservations'>) => {
    setActionLoading(reservationId)
    try {
      await markNoShow({ id: reservationId })
    } catch (error) {
      console.error('Error marking no-show:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al marcar ausencia'
      )
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelSchedule = async () => {
    if (
      !confirm(
        '¿Estás seguro de cancelar esta clase? Se cancelarán todas las reservas.'
      )
    ) {
      return
    }
    setIsCancelling(true)
    try {
      await cancelSchedule({ id: scheduleId })
      onOpenChange(false)
    } catch (error) {
      console.error('Error cancelling schedule:', error)
      toast.error(
        error instanceof Error ? error.message : 'Error al cancelar la clase'
      )
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <Badge variant="default" className="gap-1">
            <Clock className="h-3 w-3" />
            Confirmada
          </Badge>
        )
      case 'attended':
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle2 className="h-3 w-3" />
            Asistió
          </Badge>
        )
      case 'no_show':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            No asistió
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Cancelada
          </Badge>
        )
      default:
        return null
    }
  }

  const isPastClass = schedule ? schedule.startTime < Date.now() : false
  const isCancelled = schedule?.status === 'cancelled'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {!schedule || !reservations ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-muted-foreground">Cargando detalles...</p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{schedule.class?.name}</DialogTitle>
              <DialogDescription>
                {format(
                  new Date(schedule.startTime),
                  "EEEE d 'de' MMMM 'a las' HH:mm",
                  {
                    locale: es,
                  }
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Schedule Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Capacidad</p>
                  <p className="text-lg font-semibold">
                    {schedule.currentReservations} / {schedule.capacity}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estado</p>
                  <ClassStatusBadge status={schedule.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Confirmadas</p>
                  <p className="text-lg font-semibold">{confirmedCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Asistencias</p>
                  <p className="text-lg font-semibold">
                    {attendedCount}
                    {noShowCount > 0 && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({noShowCount} ausentes)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {!isCancelled && (
                <div className="flex justify-between items-center">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="confirmed">Confirmadas</SelectItem>
                      <SelectItem value="attended">Asistieron</SelectItem>
                      <SelectItem value="no_show">No asistieron</SelectItem>
                      <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>

                  {!isPastClass && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancelSchedule}
                      disabled={isCancelling}
                    >
                      {isCancelling ? 'Cancelando...' : 'Cancelar Clase'}
                    </Button>
                  )}
                </div>
              )}

              {/* Reservations List */}
              <div className="space-y-2">
                <h3 className="font-semibold">
                  Reservas ({filteredReservations.length})
                </h3>

                {filteredReservations.length === 0 ? (
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyMedia>
                        <Image
                          src={matWolfLooking}
                          alt=""
                          className="h-16 w-16 object-contain"
                        />
                      </EmptyMedia>
                      <EmptyTitle>No hay reservas</EmptyTitle>
                      <EmptyDescription>
                        {statusFilter === 'all'
                          ? 'No hay reservas para esta clase'
                          : 'No hay reservas con este estado'}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="space-y-2">
                    {filteredReservations.map((reservation) => (
                      <div
                        key={reservation._id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={reservation.user?.imageUrl} />
                            <AvatarFallback>
                              {reservation.user?.firstName?.[0]}
                              {reservation.user?.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {reservation.user?.fullName || 'Usuario'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {reservation.user?.email}
                            </p>
                            {reservation.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {reservation.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {getStatusBadge(reservation.status)}

                          {reservation.status === 'confirmed' &&
                            isPastClass && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCheckIn(reservation._id)}
                                  disabled={actionLoading === reservation._id}
                                >
                                  Registrar asistencia
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleMarkNoShow(reservation._id)
                                  }
                                  disabled={actionLoading === reservation._id}
                                >
                                  Marcar ausente
                                </Button>
                              </div>
                            )}

                          {reservation.checkedInAt && (
                            <p className="text-xs text-muted-foreground">
                              {format(
                                new Date(reservation.checkedInAt),
                                'HH:mm',
                                {
                                  locale: es,
                                }
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
