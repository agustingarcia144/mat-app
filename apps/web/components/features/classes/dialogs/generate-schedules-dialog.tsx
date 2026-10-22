"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarPlus, CalendarRange, Layers3 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { type Id } from "@/convex/_generated/dataModel";
import { generateTurnosTimeWindowSchema, z } from "@repo/core/schemas";
import { toast } from "sonner";

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const SLOT_INTERVAL_OPTIONS = [
  { value: 15, label: "Cada 15 min" },
  { value: 30, label: "Cada 30 min" },
  { value: 60, label: "Cada hora" },
  { value: 120, label: "Cada 2 horas" },
];

const MAX_SLOTS_PER_GENERATION = 400;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: `${String(i).padStart(2, "0")}:00`,
}));

const MINUTE_STEP_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
);

const MODE_OPTIONS = [
  {
    value: "timeWindow",
    label: "Varios turnos",
    description: "Cada cierto tiempo, en un rango de fechas.",
    icon: CalendarRange,
  },
  {
    value: "single",
    label: "Un turno",
    description: "Una fecha y hora puntual.",
    icon: CalendarPlus,
  },
  {
    value: "modelWeek",
    label: "Semana modelo",
    description: "Se repite cada semana como plantilla.",
    icon: Layers3,
  },
] as const;

function parseTimeHHmm(value: string | undefined): {
  hour: string;
  minute: string;
} {
  if (!value || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    return { hour: "08", minute: "00" };
  }
  const [h, m] = value.split(":");
  return {
    hour: h!.padStart(2, "0"),
    minute: m!.padStart(2, "0"),
  };
}

type Mode = "timeWindow" | "single" | "modelWeek";

const generateTurnosFormSchema = z
  .object({
    mode: z.enum(["timeWindow", "single", "modelWeek"]),
    classId: z.string().min(1, "Selecciona una clase"),
    duration: z.coerce
      .number()
      .min(15, "Mínimo 15 minutos")
      .max(480, "Máximo 8 horas"),
    // single
    startDate: z.date().optional(),
    startTime: z
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    // timeWindow
    rangeStartDate: z.date().optional(),
    rangeEndDate: z.date().optional(),
    timeWindowStart: z.string().optional(),
    timeWindowEnd: z.string().optional(),
    slotIntervalMinutes: z.number().optional(),
    daysOfWeek: z.array(z.number()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "single") {
      if (!data.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "Fecha requerida",
        });
      }
      if (!data.startTime) {
        ctx.addIssue({
          code: "custom",
          path: ["startTime"],
          message: "Hora requerida",
        });
      }
    }
    if (data.mode === "modelWeek") {
      if (!data.daysOfWeek || data.daysOfWeek.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["daysOfWeek"],
          message: "Seleccioná al menos un día",
        });
      }
      if (!data.timeWindowStart) {
        ctx.addIssue({
          code: "custom",
          path: ["timeWindowStart"],
          message: "Hora inicio requerida",
        });
      }
      if (!data.timeWindowEnd) {
        ctx.addIssue({
          code: "custom",
          path: ["timeWindowEnd"],
          message: "Hora fin requerida",
        });
      }
      if (
        data.timeWindowStart &&
        data.timeWindowEnd &&
        data.timeWindowStart >= data.timeWindowEnd
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["timeWindowEnd"],
          message: "La hora fin debe ser mayor a la hora inicio",
        });
      }
    }
    if (data.mode === "timeWindow") {
      const tw = generateTurnosTimeWindowSchema.safeParse({
        rangeStartDate: data.rangeStartDate,
        rangeEndDate: data.rangeEndDate,
        timeWindowStart: data.timeWindowStart,
        timeWindowEnd: data.timeWindowEnd,
        slotIntervalMinutes: data.slotIntervalMinutes ?? 60,
        durationMinutes: data.duration,
        daysOfWeek: data.daysOfWeek,
      });
      if (!tw.success) {
        tw.error.issues.forEach((issue) => {
          const path = issue.path[0] as string;
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: issue.message,
          });
        });
      }
    }
  });

type GenerateTurnosFormValues = z.infer<typeof generateTurnosFormSchema>;

interface GenerateSchedulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClassId?: Id<"classes">;
  initialClassTitle?: string;
  onSuccess?: () => void;
}

function approximateTimeWindowCount(
  rangeStart: Date,
  rangeEnd: Date,
  timeStartMins: number,
  timeEndMins: number,
  intervalMins: number,
  daysOfWeek?: number[],
): number {
  const dayMs = 24 * 60 * 60 * 1000;
  let days = 0;
  let current = new Date(rangeStart);
  current.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);
  while (current.getTime() <= end.getTime()) {
    const dow = current.getDay();
    if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(dow)) {
      days++;
    }
    current = new Date(current.getTime() + dayMs);
  }
  const slotsPerDay = Math.floor((timeEndMins - timeStartMins) / intervalMins);
  return days * slotsPerDay;
}

export default function GenerateSchedulesDialog({
  open,
  onOpenChange,
  initialClassId,
  initialClassTitle,
  onSuccess,
}: GenerateSchedulesDialogProps) {
  const classes = useQuery(
    api.classes.getByOrganization,
    open ? { activeOnly: false } : "skip",
  );
  const generateSchedules = useMutation(api.classes.generateSchedules);
  const generateFromTimeWindow = useMutation(
    api.classes.generateSchedulesFromTimeWindow,
  );
  const createModelWeekSlot = useMutation(api.modelWeekSlots.create);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInProgress = useRef(false);

  const form = useForm<GenerateTurnosFormValues>({
    resolver: zodResolver(generateTurnosFormSchema as any) as any,
    defaultValues: {
      mode: "timeWindow",
      classId: "",
      duration: 60,
      startDate: new Date(),
      startTime: "09:00",
      rangeStartDate: new Date(),
      rangeEndDate: new Date(),
      timeWindowStart: "08:00",
      timeWindowEnd: "20:00",
      slotIntervalMinutes: 60,
      daysOfWeek: undefined,
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = form;

  const mode = watch("mode");
  const classId = watch("classId");
  const rangeStartDate = watch("rangeStartDate");
  const rangeEndDate = watch("rangeEndDate");
  const timeWindowStart = watch("timeWindowStart");
  const timeWindowEnd = watch("timeWindowEnd");
  const slotIntervalMinutes = watch("slotIntervalMinutes");
  const duration = watch("duration");
  const daysOfWeek = watch("daysOfWeek");

  useEffect(() => {
    if (open && initialClassId) {
      setValue("classId", initialClassId);
    }
  }, [open, initialClassId, setValue]);

  // Keep end date in sync: if start is set and end is missing or before start, use start (single day)
  useEffect(() => {
    if (mode !== "timeWindow" || !rangeStartDate) return;
    const end = rangeEndDate ?? null;
    if (end == null || end < rangeStartDate) {
      setValue("rangeEndDate", rangeStartDate);
    }
  }, [mode, rangeStartDate, rangeEndDate, setValue]);

  useEffect(() => {
    if (!open) {
      reset({
        mode: "timeWindow",
        classId: initialClassId ?? "",
        duration: 60,
        startDate: new Date(),
        startTime: "09:00",
        rangeStartDate: new Date(),
        rangeEndDate: new Date(),
        timeWindowStart: "08:00",
        timeWindowEnd: "20:00",
        slotIntervalMinutes: 60,
        daysOfWeek: undefined,
      });
    }
  }, [open, reset, initialClassId]);

  const dateRange: DateRange | undefined =
    rangeStartDate != null
      ? { from: rangeStartDate, to: rangeEndDate ?? undefined }
      : undefined;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const approximateCount =
    (mode === "timeWindow" || mode === "modelWeek") &&
    timeWindowStart &&
    timeWindowEnd &&
    slotIntervalMinutes != null
      ? (() => {
          const [sh, sm] = timeWindowStart.split(":").map(Number);
          const [eh, em] = timeWindowEnd.split(":").map(Number);
          const startMins = (sh ?? 0) * 60 + (sm ?? 0);
          const endMins = (eh ?? 0) * 60 + (em ?? 0);
          if (endMins <= startMins) return 0;
          const slotsPerDay = Math.floor(
            (endMins - startMins) / slotIntervalMinutes,
          );
          if (mode === "modelWeek") {
            return (daysOfWeek?.length ?? 0) * slotsPerDay;
          }
          if (!rangeStartDate || !rangeEndDate) return null;
          return approximateTimeWindowCount(
            rangeStartDate,
            rangeEndDate,
            startMins,
            endMins,
            slotIntervalMinutes,
            daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : undefined,
          );
        })()
      : null;

  const onSubmit = async (data: GenerateTurnosFormValues) => {
    if (!data.classId) return;
    if (submitInProgress.current) return;
    submitInProgress.current = true;
    const classIdArg = data.classId as Id<"classes">;
    setIsSubmitting(true);
    try {
      if (
        data.mode === "single" &&
        data.startDate != null &&
        data.startTime != null
      ) {
        const [hours, minutes] = data.startTime.split(":").map(Number);
        const startDateTime = new Date(data.startDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        const startTime = startDateTime.getTime();
        const endTime = startTime + data.duration * 60 * 1000;
        const result = await generateSchedules({
          classId: classIdArg,
          startDate: startTime,
          endTime,
        });
        toast.success(`Se creó ${result.count} turno correctamente`);
      } else if (
        data.mode === "timeWindow" &&
        data.rangeStartDate &&
        data.timeWindowStart &&
        data.timeWindowEnd &&
        data.slotIntervalMinutes != null
      ) {
        // Use single day when end is missing or before start (avoids generating on unintended days)
        const startDate = data.rangeStartDate;
        const endDateRaw = data.rangeEndDate;
        const endDate =
          endDateRaw && endDateRaw >= startDate ? endDateRaw : startDate;

        const [sh, sm] = data.timeWindowStart.split(":").map(Number);
        const [eh, em] = data.timeWindowEnd.split(":").map(Number);
        const timeWindowStartMinutes = sh * 60 + sm;
        const timeWindowEndMinutes = eh * 60 + em;
        const startDay = new Date(startDate);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(endDate);
        endDay.setHours(23, 59, 59, 999);
        const result = await generateFromTimeWindow({
          classId: classIdArg,
          startDate: startDay.getTime(),
          endDate: endDay.getTime(),
          timeWindowStartMinutes,
          timeWindowEndMinutes,
          slotIntervalMinutes: data.slotIntervalMinutes,
          durationMinutes: data.duration,
          daysOfWeek:
            data.daysOfWeek && data.daysOfWeek.length > 0
              ? data.daysOfWeek
              : undefined,
        });
        toast.success(`Se generaron ${result.count} turnos correctamente`);
      } else if (
        data.mode === "modelWeek" &&
        data.timeWindowStart &&
        data.timeWindowEnd &&
        data.slotIntervalMinutes != null &&
        data.daysOfWeek &&
        data.daysOfWeek.length > 0
      ) {
        const [sh, sm] = data.timeWindowStart.split(":").map(Number);
        const [eh, em] = data.timeWindowEnd.split(":").map(Number);
        const startMins = (sh ?? 0) * 60 + (sm ?? 0);
        const endMins = (eh ?? 0) * 60 + (em ?? 0);
        let created = 0;
        for (const dayOfWeek of data.daysOfWeek) {
          let current = startMins;
          while (current < endMins) {
            await createModelWeekSlot({
              classId: classIdArg,
              dayOfWeek,
              startTimeMinutes: current,
              durationMinutes: data.duration,
            });
            created++;
            current += data.slotIntervalMinutes;
          }
        }
        toast.success(`Se agregaron ${created} slots a la semana modelo`);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error generating schedules:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al generar turnos",
      );
    } finally {
      setIsSubmitting(false);
      submitInProgress.current = false;
    }
  };

  const isMobile = useIsMobile();
  const exceedsLimit =
    mode === "timeWindow" &&
    approximateCount != null &&
    approximateCount > MAX_SLOTS_PER_GENERATION;

  const timeFields = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field>
        <FieldLabel>Desde</FieldLabel>
        <Controller
          name="timeWindowStart"
          control={form.control}
          render={({ field }) => (
            <TimeSelect value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.timeWindowStart && (
          <FieldError>{errors.timeWindowStart.message}</FieldError>
        )}
      </Field>
      <Field>
        <FieldLabel>Hasta</FieldLabel>
        <Controller
          name="timeWindowEnd"
          control={form.control}
          render={({ field }) => (
            <TimeSelect value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.timeWindowEnd && (
          <FieldError>{errors.timeWindowEnd.message}</FieldError>
        )}
      </Field>
      <Field className="col-span-2 sm:col-span-1">
        <FieldLabel>Frecuencia</FieldLabel>
        <Controller
          name="slotIntervalMinutes"
          control={form.control}
          render={({ field }) => (
            <Select
              value={String(field.value ?? 60)}
              onValueChange={(v) => field.onChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    </div>
  );

  const toggleDay = (day: number) => {
    const current = daysOfWeek ?? [];
    const next = current.includes(day)
      ? current.filter((d: number) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setValue("daysOfWeek", next.length > 0 ? next : undefined);
  };

  const summary =
    approximateCount == null || approximateCount < 0 ? null : mode ===
      "modelWeek" ? (
      <>
        Se agregan{" "}
        <strong className="text-foreground">{approximateCount}</strong> horarios
        a la semana modelo
      </>
    ) : mode === "timeWindow" ? (
      exceedsLimit ? (
        <span className="text-destructive">
          {approximateCount} turnos: el máximo es {MAX_SLOTS_PER_GENERATION}.
          Acortá el rango o elegí menos días.
        </span>
      ) : (
        <>
          Se crean{" "}
          <strong className="text-foreground">{approximateCount}</strong> turnos
        </>
      )
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b p-5 pr-12 text-left">
          <DialogTitle>Crear turnos</DialogTitle>
          <DialogDescription>
            {initialClassTitle
              ? `Para la clase "${initialClassTitle}".`
              : "Elegí la clase y cuándo se dicta."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit as any)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <Field>
              <FieldLabel>Clase</FieldLabel>
              <Controller
                name="classId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!!initialClassId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí una clase" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes?.map((c: Doc<"classes">) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.classId && (
                <FieldError>{errors.classId.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel>Cómo crearlos</FieldLabel>
              <Controller
                name="mode"
                control={form.control}
                render={({ field }) => (
                  <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                    {MODE_OPTIONS.map((option) => {
                      const active = field.value === option.value;
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors sm:flex-col sm:gap-2",
                            active
                              ? "border-foreground bg-accent/50"
                              : "hover:bg-accent/40",
                          )}
                        >
                          <Icon
                            className={cn(
                              "mt-0.5 size-4 shrink-0 sm:mt-0",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {option.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </Field>

            {mode === "timeWindow" && (
              <>
                <Field>
                  <FieldLabel>Fechas</FieldLabel>
                  <div className="flex justify-center rounded-lg border">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range?.from) {
                          setValue("rangeStartDate", range.from);
                          // Single day when only start is picked; otherwise use range
                          setValue("rangeEndDate", range.to ?? range.from);
                        }
                      }}
                      numberOfMonths={isMobile ? 1 : 2}
                      showOutsideDays={false}
                      locale={es}
                      disabled={(date) => date < todayStart}
                    />
                  </div>
                  {dateRange?.from && (
                    <FieldDescription className="first-letter:uppercase">
                      {format(dateRange.from, "EEEE d 'de' MMMM", {
                        locale: es,
                      })}
                      {dateRange.to &&
                      dateRange.to.getTime() !== dateRange.from.getTime()
                        ? ` → ${format(dateRange.to, "EEEE d 'de' MMMM", { locale: es })}`
                        : ""}
                    </FieldDescription>
                  )}
                  {errors.rangeStartDate && (
                    <FieldError>{errors.rangeStartDate.message}</FieldError>
                  )}
                  {errors.rangeEndDate && (
                    <FieldError>{errors.rangeEndDate.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>
                    Días{" "}
                    <span className="font-normal text-muted-foreground">
                      (vacío = todos)
                    </span>
                  </FieldLabel>
                  <DayChips selected={daysOfWeek ?? []} onToggle={toggleDay} />
                </Field>

                {timeFields}
              </>
            )}

            {mode === "single" && (
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                <Field>
                  <FieldLabel>Fecha</FieldLabel>
                  <Controller
                    name="startDate"
                    control={form.control}
                    render={({ field }) => (
                      <div className="flex justify-center rounded-lg border">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < todayStart}
                          locale={es}
                        />
                      </div>
                    )}
                  />
                  {errors.startDate && (
                    <FieldError>{errors.startDate.message}</FieldError>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Hora</FieldLabel>
                  <Controller
                    name="startTime"
                    control={form.control}
                    render={({ field }) => (
                      <TimeSelect
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {errors.startTime && (
                    <FieldError>{errors.startTime.message}</FieldError>
                  )}
                </Field>
              </div>
            )}

            {mode === "modelWeek" && (
              <>
                <Field>
                  <FieldLabel>Días</FieldLabel>
                  <DayChips selected={daysOfWeek ?? []} onToggle={toggleDay} />
                  {errors.daysOfWeek && (
                    <FieldError>{errors.daysOfWeek.message}</FieldError>
                  )}
                </Field>
                {timeFields}
              </>
            )}

            <Field className="max-w-[200px]">
              <FieldLabel>Duración de cada turno</FieldLabel>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  {...register("duration", { valueAsNumber: true })}
                  min={15}
                  max={480}
                  step={15}
                  className="pr-12"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  min
                </span>
              </div>
              {errors.duration && (
                <FieldError>{errors.duration.message}</FieldError>
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{summary}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 sm:flex-none"
                disabled={
                  isSubmitting ||
                  exceedsLimit ||
                  (mode === "modelWeek" &&
                    (approximateCount === 0 || approximateCount === null))
                }
              >
                {isSubmitting
                  ? "Creando..."
                  : mode === "modelWeek"
                    ? "Agregar a la semana"
                    : "Crear turnos"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const { hour, minute } = parseTimeHHmm(value);
  // Keep an odd saved minute selectable even though the list steps by 5.
  const minutes = MINUTE_STEP_OPTIONS.includes(minute)
    ? MINUTE_STEP_OPTIONS
    : [...MINUTE_STEP_OPTIONS, minute].sort();
  return (
    <div className="flex items-center gap-1">
      <Select value={hour} onValueChange={(h) => onChange(`${h}:${minute}`)}>
        <SelectTrigger
          className="min-w-0 flex-1 tabular-nums"
          aria-label="Hora"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOUR_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={minute} onValueChange={(m) => onChange(`${hour}:${m}`)}>
        <SelectTrigger
          className="min-w-0 flex-1 tabular-nums"
          aria-label="Minutos"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DayChips({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {DAYS_OF_WEEK.map((day) => {
        const active = selected.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(day.value)}
            className={cn(
              "h-9 flex-1 rounded-md border text-sm font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
