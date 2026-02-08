import { z } from 'zod'

// Planification schemas
export const planificationBasicInfoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
  description: z.string().optional(),
  folderId: z.string().optional(),
  isTemplate: z.boolean(),
})

export const dayExerciseSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  sets: z.number().min(1, 'Debe tener al menos 1 serie').int(),
  reps: z.string().min(1, 'Las repeticiones son requeridas'),
  weight: z.string().optional(),
  notes: z.string().optional(),
})

export const workoutDaySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre del día es requerido').trim(),
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
  workoutWeeks: z.array(workoutWeekSchema).min(1, 'Debe tener al menos una semana'),
})

// Exercise library schemas
export const exerciseSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').trim(),
  description: z.string().optional(),
  category: z.string().min(1, 'La categoría es requerida'),
  equipment: z.string().optional(),
  videoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
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

// Type exports
export type PlanificationBasicInfo = z.infer<typeof planificationBasicInfoSchema>
export type PlanificationForm = z.infer<typeof planificationFormSchema>
export type WorkoutWeek = z.infer<typeof workoutWeekSchema>
export type WorkoutDay = z.infer<typeof workoutDaySchema>
export type DayExercise = z.infer<typeof dayExerciseSchema>
export type Exercise = z.infer<typeof exerciseSchema>
export type Folder = z.infer<typeof folderSchema>
export type Assignment = z.infer<typeof assignmentSchema>

export { z }

