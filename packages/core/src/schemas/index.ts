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
  reps: z.string().min(1, 'Las repeticiones son requeridas'),
  weight: z.string().optional(),
  notes: z.string().optional(),
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
      message: 'El patrón de recurrencia es requerido cuando la clase es recurrente',
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
  .refine(
    (data) => data.endTime > data.startTime,
    {
      message: 'La hora de fin debe ser posterior a la hora de inicio',
      path: ['endTime'],
    }
  )

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
})


// Type exports
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

// Keep scheduleFormSchema in bundle (referenced by type only otherwise)
void scheduleFormSchema

export { z }
