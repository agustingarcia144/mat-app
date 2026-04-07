import { z } from 'zod'

// Planification schemas
export const planificationBasicInfoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
  description: z.string().optional(),
  folderId: z.string().optional(),
  isTemplate: z.boolean(),
})

export const exerciseBlockSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre del bloque es requerido').trim(),
  order: z.number(),
  notes: z.string().optional(),
})

export const dayExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  blockId: z.string().optional(),
  blockName: z.string().optional(), // For form convenience
  sets: z.number().min(1, 'Debe tener al menos 1 serie').int(),
  reps: z.string().optional(),
  weight: z.string().optional(),
  prPercentage: z.number().positive('El porcentaje debe ser mayor a 0').optional(),
  /** Time in seconds (always stored in seconds; UI may display/input in minutes) */
  timeSeconds: z.number().int().min(0).optional(),
  notes: z.string().optional(),
}).refine((data) => !(data.weight?.trim() && data.prPercentage != null), {
  message: 'Usa peso o % de PR, no ambos',
  path: ['prPercentage'],
})

export const workoutDaySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre del día es requerido').trim(),
  // ISO weekday: 1 = Lunes … 7 = Domingo. Omit = Sin asignar
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  blocks: z.array(exerciseBlockSchema).optional(),
  exercises: z.array(dayExerciseSchema),
})

export const workoutWeekSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre de la semana es requerido').trim(),
  workoutDays: z.array(workoutDaySchema),
})

export const planificationFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
  description: z.string().optional(),
  folderId: z.string().optional(),
  isTemplate: z.boolean(),
  workoutWeeks: z
    .array(workoutWeekSchema)
    .min(1, 'Debe tener al menos una semana'),
})

// Exercise library schemas
export const exerciseSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
  description: z.string().optional(),
  category: z.string().min(1, 'La categoría es requerida'),
  equipment: z.string().optional(),
  videoUrl: z.url('URL inválida').optional().or(z.literal('')),
  muscleGroups: z.array(z.string()),
})

// Folder schemas
export const folderSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
})

// Assignment schemas
export const assignmentSchema = z.object({
  userId: z.string().min(1, 'Selecciona un miembro'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
})

// Class reservation schemas
export const recurrencePatternSchema = z.object({
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly'], {
    message: 'Selecciona una frecuencia válida',
  }),
  interval: z.coerce
    .number()
    .int('El intervalo debe ser un número entero')
    .min(1, 'El intervalo debe ser al menos 1'),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6, 'Los días deben estar entre 0 y 6'))
    .optional(),
  endDate: z.number().optional(),
})

export const classSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').trim(),
    description: z.string().optional(),
    capacity: z
      .number()
      .int('La capacidad debe ser un número entero')
      .min(1, 'La capacidad debe ser al menos 1')
      .max(1000, 'La capacidad máxima es 1000'),
    trainerId: z.string().optional(),
    bookingWindowDays: z
      .number()
      .int('Los días deben ser un número entero')
      .min(0, 'La ventana de reserva debe ser al menos 0')
      .max(365, 'La ventana máxima es 365 días')
      .default(7),
    cancellationWindowHours: z
      .number()
      .min(0, 'La ventana de cancelación debe ser al menos 0')
      .max(168, 'La ventana máxima es 168 horas')
      .default(2),
    isRecurring: z.boolean().default(false),
    recurrencePattern: recurrencePatternSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // If isRecurring is true, recurrencePattern must be present
      if (data.isRecurring && !data.recurrencePattern) {
        return false
      }
      return true
    },
    {
      message:
        'El patrón de recurrencia es requerido cuando la clase es recurrente',
      path: ['recurrencePattern'],
    }
  )

export const scheduleSchema = z
  .object({
    classId: z.string().min(1, 'El ID de clase es requerido'),
    startTime: z.number(),
    endTime: z.number(),
    capacity: z.number().optional(), // Override class capacity
    notes: z.string().optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'La hora de fin debe ser posterior a la hora de inicio',
    path: ['endTime'],
  })

export const reservationSchema = z.object({
  scheduleId: z.string(),
  notes: z.string().optional(),
})

export const scheduleFormSchema = z.object({
  startDate: z.date(),
  startTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato inválido (HH:mm)'),
  duration: z.coerce
    .number()
    .min(15, 'Mínimo 15 minutos')
    .max(480, 'Máximo 8 horas'),
  endDate: z.date().optional(), // Optional end date for generation (from Generate Schedules dialog)
})

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
/** Form schema for "Generar turnos" dialog - time window mode (e.g. 8am–8pm every hour) */
export const generateTurnosTimeWindowSchema = z
  .object({
    rangeStartDate: z.date(),
    rangeEndDate: z.date(),
    timeWindowStart: z.string().regex(timeRegex, 'Formato inválido (HH:mm)'),
    timeWindowEnd: z.string().regex(timeRegex, 'Formato inválido (HH:mm)'),
    slotIntervalMinutes: z.coerce
      .number()
      .int()
      .min(15, 'Mínimo 15 minutos')
      .max(120, 'Máximo 2 horas'),
    durationMinutes: z.coerce
      .number()
      .min(15, 'Mínimo 15 minutos')
      .max(480, 'Máximo 8 horas'),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  })
  .refine((data) => data.rangeEndDate >= data.rangeStartDate, {
    message: 'La fecha fin debe ser igual o posterior a la fecha inicio',
    path: ['rangeEndDate'],
  })
  .refine(
    (data) => {
      const [sh, sm] = data.timeWindowStart.split(':').map(Number)
      const [eh, em] = data.timeWindowEnd.split(':').map(Number)
      const startMins = sh * 60 + sm
      const endMins = eh * 60 + em
      return endMins > startMins
    },
    { message: 'La hora fin debe ser posterior a la hora inicio', path: ['timeWindowEnd'] }
  )

// Membership plan schema
const interestTierSchema = z.object({
  daysAfterWindowEnd: z.coerce
    .number()
    .int()
    .min(1, 'Debe ser al menos 1 día después del cierre'),
  type: z.enum(['percentage', 'fixed']),
  value: z.coerce.number().positive('El valor debe ser mayor a 0'),
})

const advancePaymentDiscountSchema = z.object({
  months: z.coerce
    .number()
    .int()
    .min(2, 'Mínimo 2 meses'),
  discountPercentage: z.coerce
    .number()
    .min(0.1, 'El descuento debe ser mayor a 0')
    .max(100, 'El descuento no puede superar el 100%'),
})

export const membershipPlanSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').trim(),
    description: z.string().optional(),
    priceArs: z.coerce
      .number()
      .int('El precio debe ser un número entero')
      .min(1, 'El precio debe ser al menos $1'),
    weeklyClassLimit: z.coerce
      .number()
      .int('El límite debe ser un número entero')
      .min(1, 'El límite debe ser al menos 1 clase'),
    paymentWindowStartDay: z.coerce
      .number()
      .int()
      .min(1, 'El día debe ser entre 1 y 28')
      .max(28, 'El día debe ser entre 1 y 28'),
    paymentWindowEndDay: z.coerce
      .number()
      .int()
      .min(1, 'El día debe ser entre 1 y 28')
      .max(28, 'El día debe ser entre 1 y 28'),
    interestTiers: z.array(interestTierSchema).default([]),
    advancePaymentDiscounts: z.array(advancePaymentDiscountSchema).default([]),
  })
  .refine(
    (data) => data.paymentWindowEndDay >= data.paymentWindowStartDay,
    {
      message:
        'El día de cierre debe ser igual o posterior al día de apertura',
      path: ['paymentWindowEndDay'],
    }
  )

// Type exports
export type MembershipPlanForm = z.infer<typeof membershipPlanSchema>
export type PlanificationBasicInfo = z.infer<
  typeof planificationBasicInfoSchema
>
export type PlanificationForm = z.infer<typeof planificationFormSchema>
export type WorkoutWeek = z.infer<typeof workoutWeekSchema>
export type WorkoutDay = z.infer<typeof workoutDaySchema>
export type DayExercise = z.infer<typeof dayExerciseSchema>
export type Exercise = z.infer<typeof exerciseSchema>
export type Folder = z.infer<typeof folderSchema>
export type Assignment = z.infer<typeof assignmentSchema>
export type ClassForm = z.infer<typeof classSchema>
// RecurrencePattern type is exported from @repo/core/types to avoid duplication
export type Schedule = z.infer<typeof scheduleSchema>
export type ReservationForm = z.infer<typeof reservationSchema>
export type ScheduleForm = z.infer<typeof scheduleFormSchema>
export type GenerateTurnosTimeWindowForm = z.infer<
  typeof generateTurnosTimeWindowSchema
>

// Keep scheduleFormSchema in bundle (referenced by type only otherwise)
void scheduleFormSchema
void generateTurnosTimeWindowSchema

export { z }
