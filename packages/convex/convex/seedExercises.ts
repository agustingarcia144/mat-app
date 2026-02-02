import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

/**
 * Seed initial exercises for an organization
 * Call this manually from Convex dashboard or via an admin action
 */
export const seedInitialExercises = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    const exercises = [
      // Tren superior - Pecho
      {
        name: 'Press de banca',
        description: 'Ejercicio principal para pecho',
        category: 'Tren superior',
        muscleGroups: ['pecho', 'tríceps', 'hombros'],
        equipment: 'Barra',
      },
      {
        name: 'Press inclinado con mancuernas',
        description: 'Enfoque en pecho superior',
        category: 'Tren superior',
        muscleGroups: ['pecho', 'hombros'],
        equipment: 'Mancuernas',
      },
      {
        name: 'Aperturas con mancuernas',
        description: 'Aislamiento de pecho',
        category: 'Tren superior',
        muscleGroups: ['pecho'],
        equipment: 'Mancuernas',
      },

      // Tren superior - Espalda
      {
        name: 'Peso muerto',
        description: 'Ejercicio compuesto para espalda y piernas',
        category: 'Tren superior',
        muscleGroups: ['espalda', 'isquiotibiales', 'glúteos'],
        equipment: 'Barra',
      },
      {
        name: 'Dominadas',
        description: 'Ejercicio de tracción vertical',
        category: 'Tren superior',
        muscleGroups: ['espalda', 'bíceps'],
        equipment: 'Peso corporal',
      },
      {
        name: 'Remo con barra',
        description: 'Tracción horizontal para espalda',
        category: 'Tren superior',
        muscleGroups: ['espalda', 'bíceps'],
        equipment: 'Barra',
      },

      // Tren superior - Hombros
      {
        name: 'Press militar',
        description: 'Ejercicio principal para hombros',
        category: 'Tren superior',
        muscleGroups: ['hombros', 'tríceps'],
        equipment: 'Barra',
      },
      {
        name: 'Elevaciones laterales',
        description: 'Aislamiento de hombro medio',
        category: 'Tren superior',
        muscleGroups: ['hombros'],
        equipment: 'Mancuernas',
      },

      // Tren superior - Brazos
      {
        name: 'Curl de bíceps con barra',
        description: 'Ejercicio básico de bíceps',
        category: 'Tren superior',
        muscleGroups: ['bíceps'],
        equipment: 'Barra',
      },
      {
        name: 'Extensiones de tríceps',
        description: 'Aislamiento de tríceps',
        category: 'Tren superior',
        muscleGroups: ['tríceps'],
        equipment: 'Mancuernas',
      },

      // Tren inferior
      {
        name: 'Sentadilla con barra',
        description: 'Ejercicio principal de piernas',
        category: 'Tren inferior',
        muscleGroups: ['cuádriceps', 'glúteos', 'isquiotibiales'],
        equipment: 'Barra',
      },
      {
        name: 'Prensa de piernas',
        description: 'Ejercicio de piernas en máquina',
        category: 'Tren inferior',
        muscleGroups: ['cuádriceps', 'glúteos'],
        equipment: 'Máquina',
      },
      {
        name: 'Zancadas',
        description: 'Ejercicio unilateral de piernas',
        category: 'Tren inferior',
        muscleGroups: ['cuádriceps', 'glúteos'],
        equipment: 'Mancuernas',
      },
      {
        name: 'Curl femoral',
        description: 'Aislamiento de isquiotibiales',
        category: 'Tren inferior',
        muscleGroups: ['isquiotibiales'],
        equipment: 'Máquina',
      },
      {
        name: 'Elevaciones de pantorrilla',
        description: 'Ejercicio para pantorrillas',
        category: 'Tren inferior',
        muscleGroups: ['pantorrillas'],
        equipment: 'Máquina',
      },

      // Core
      {
        name: 'Plancha',
        description: 'Ejercicio isométrico de core',
        category: 'Core',
        muscleGroups: ['core', 'abdominales'],
        equipment: 'Peso corporal',
      },
      {
        name: 'Crunches',
        description: 'Ejercicio básico de abdominales',
        category: 'Core',
        muscleGroups: ['abdominales'],
        equipment: 'Peso corporal',
      },
      {
        name: 'Russian twists',
        description: 'Trabajo de oblicuos',
        category: 'Core',
        muscleGroups: ['core', 'abdominales'],
        equipment: 'Peso corporal',
      },

      // Cardio
      {
        name: 'Burpees',
        description: 'Ejercicio de cuerpo completo',
        category: 'Cardio',
        muscleGroups: ['core'],
        equipment: 'Peso corporal',
      },
      {
        name: 'Saltos de caja',
        description: 'Ejercicio pliométrico',
        category: 'Cardio',
        muscleGroups: ['cuádriceps', 'glúteos'],
        equipment: 'Otro',
      },
    ]

    for (const exercise of exercises) {
      await ctx.db.insert('exercises', {
        organizationId: args.organizationId,
        ...exercise,
        createdBy: args.createdBy,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { count: exercises.length }
  },
})
