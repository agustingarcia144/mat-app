/** Day exercise with exercise details (from dayExercises.getByPlanification) */
export interface DayExerciseWithDetails {
  _id: string
  exerciseId: string
  workoutDayId: string
  blockId?: string
  order: number
  sets: number
  reps: string
  weight?: string
  prPercentage?: number
  exercise?: { name?: string; videoUrl?: string } | null
}

/** Exercise block (from exerciseBlocks) */
export interface ExerciseBlock {
  _id: string
  name: string
  order: number
  workoutDayId: string
}

/** Workout day (from workoutDays) */
export interface WorkoutDay {
  _id: string
  name: string
  dayOfWeek?: number
}
