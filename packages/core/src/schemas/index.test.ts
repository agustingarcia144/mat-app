import { describe, expect, it } from "vitest";
import {
  classSchema,
  dayExerciseSchema,
  exerciseSchema,
  planificationFormSchema,
  recurrencePatternSchema,
} from "./index";

const validDayExercise = {
  id: "ex-1",
  exerciseId: "exercise_1",
  exerciseName: "Sentadilla",
  sets: 3,
  reps: "10",
};

const validPlanification = {
  name: "  Fuerza base  ",
  isTemplate: false,
  workoutWeeks: [
    {
      id: "week-1",
      name: "Semana 1",
      workoutDays: [
        {
          id: "day-1",
          name: "Día 1",
          dayOfWeek: 1,
          exercises: [validDayExercise],
        },
      ],
    },
  ],
};

describe("planificationFormSchema", () => {
  it("accepts a valid planification and trims the name", () => {
    const result = planificationFormSchema.safeParse(validPlanification);
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Fuerza base");
  });

  it("requires at least one week", () => {
    const result = planificationFormSchema.safeParse({
      ...validPlanification,
      workoutWeeks: [],
    });
    expect(result.success).toBe(false);
  });

  it("requires a name", () => {
    const result = planificationFormSchema.safeParse({
      ...validPlanification,
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("dayExerciseSchema", () => {
  it("accepts weight or PR percentage on their own", () => {
    expect(
      dayExerciseSchema.safeParse({ ...validDayExercise, weight: "60kg" })
        .success,
    ).toBe(true);
    expect(
      dayExerciseSchema.safeParse({ ...validDayExercise, prPercentage: 80 })
        .success,
    ).toBe(true);
  });

  it("rejects weight and PR percentage together", () => {
    const result = dayExerciseSchema.safeParse({
      ...validDayExercise,
      weight: "60kg",
      prPercentage: 80,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["prPercentage"]);
  });

  it("rejects less than one set", () => {
    expect(
      dayExerciseSchema.safeParse({ ...validDayExercise, sets: 0 }).success,
    ).toBe(false);
  });
});

describe("exerciseSchema", () => {
  const validExercise = {
    name: "Peso muerto",
    category: "Dominante de cadera",
    muscleGroups: ["glúteos", "isquiotibiales"],
  };

  it("accepts an exercise with no video, an empty video or a valid url", () => {
    expect(exerciseSchema.safeParse(validExercise).success).toBe(true);
    expect(
      exerciseSchema.safeParse({ ...validExercise, videoUrl: "" }).success,
    ).toBe(true);
    expect(
      exerciseSchema.safeParse({
        ...validExercise,
        videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid video url", () => {
    expect(
      exerciseSchema.safeParse({ ...validExercise, videoUrl: "no es una url" })
        .success,
    ).toBe(false);
  });
});

describe("recurrencePatternSchema", () => {
  it("coerces the interval to a number", () => {
    const result = recurrencePatternSchema.safeParse({
      frequency: "weekly",
      interval: "2",
      daysOfWeek: [1, 3, 5],
    });
    expect(result.success).toBe(true);
    expect(result.data?.interval).toBe(2);
  });

  it("rejects an unknown frequency", () => {
    expect(
      recurrencePatternSchema.safeParse({ frequency: "yearly", interval: 1 })
        .success,
    ).toBe(false);
  });
});

describe("classSchema", () => {
  const validClass = { name: "Funcional", capacity: 20 };

  it("applies defaults", () => {
    const result = classSchema.safeParse(validClass);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      bookingWindowDays: 7,
      cancellationWindowHours: 2,
      isRecurring: false,
      isActive: true,
    });
  });

  it("requires a recurrence pattern when the class is recurring", () => {
    const result = classSchema.safeParse({ ...validClass, isRecurring: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["recurrencePattern"]);
  });

  it("rejects a capacity out of range", () => {
    expect(classSchema.safeParse({ ...validClass, capacity: 0 }).success).toBe(
      false,
    );
    expect(
      classSchema.safeParse({ ...validClass, capacity: 1001 }).success,
    ).toBe(false);
  });
});
