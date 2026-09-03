/**
 * What Mati is allowed to ask for, and what the answers look like.
 *
 * The assistant cannot introspect the database: unless it is told the exact
 * field names a dataset projects, it guesses ("amount", "date", "month"), the
 * query throws AI_UNKNOWN_FIELD, and the user gets nothing. So this catalog is
 * rendered into the tool description and is also queryable via the `schema`
 * tool source.
 *
 * It must stay in lockstep with `loadDataset` in `ai.ts` and with
 * `REPORT_ACCESS` / `runReport`; `ai.test.ts` fails if they drift.
 */

export type CatalogAccess = "staff" | "admin";

export type CatalogField = {
  name: string;
  /**
   * `epochMs` values are numbers and must be compared with numbers; `period` is
   * "YYYY-MM"; `date` is "YYYY-MM-DD". Mixing these up is the single most
   * common cause of an empty result.
   */
  type: "string" | "number" | "boolean" | "epochMs" | "period" | "date";
  notes?: string;
};

export type CatalogEntry = {
  dataset: string;
  access: CatalogAccess;
  description: string;
  fields: CatalogField[];
  examples?: string[];
};

const f = (
  name: string,
  type: CatalogField["type"],
  notes?: string,
): CatalogField => ({ name, type, notes });

const MEMBER = f("member", "string", "nombre visible del socio");
const STAFF = f("staff", "string", "nombre visible del miembro del staff");

export const DATASET_CATALOG: CatalogEntry[] = [
  {
    dataset: "members",
    access: "staff",
    description:
      "Personas de la organización (socios y staff), con su rol y estado.",
    fields: [
      f("name", "string"),
      f("email", "string"),
      f("phone", "string"),
      f("birthday", "string"),
      f("role", "string", "admin | trainer | employee | member"),
      f("status", "string", "active | inactive"),
      f("usesPlanification", "boolean"),
      f("responsibleStaff", "string"),
      f("joinedAt", "epochMs"),
      f("lastActiveAt", "epochMs"),
    ],
    examples: [
      'socios activos: filters [{field:"role",op:"eq",value:"member"},{field:"status",op:"eq",value:"active"}]',
    ],
  },
  {
    dataset: "membershipPlans",
    access: "admin",
    description: "Planes de membresía que la organización ofrece y su precio.",
    fields: [
      f("name", "string"),
      f("description", "string"),
      f("priceArs", "number", "pesos enteros"),
      f("weeklyClassLimit", "number"),
      f("billingMode", "string", "calendar | join_date"),
      f("paymentWindowStartDay", "number"),
      f("paymentWindowEndDay", "number"),
      f("interestTiersSummary", "string", "recargos por mora, ya legibles"),
      f("classesEnabled", "boolean"),
      f("isActive", "boolean"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "memberSubscriptions",
    access: "admin",
    description: "Suscripción de cada socio a un plan y su estado actual.",
    fields: [
      MEMBER,
      f("plan", "string"),
      f("status", "string", "pending_payment | active | suspended | cancelled"),
      f(
        "paymentMode",
        "string",
        "manual | mercadopago_recurring | mercadopago_one_time",
      ),
      f("activatedAt", "epochMs"),
      f("accessEndsAt", "epochMs"),
      f("updatedAt", "epochMs"),
    ],
  },
  {
    dataset: "memberPayments",
    access: "admin",
    description:
      "Cuotas de membresía por período. Una fila por socio y período de facturación.",
    fields: [
      MEMBER,
      f("plan", "string"),
      f("billingPeriod", "period"),
      f("amountArs", "number"),
      f("totalAmountArs", "number", "amountArs + intereses"),
      f("interestTotalArs", "number"),
      f("dueAt", "epochMs"),
      f("billingCycleStartAt", "epochMs"),
      f("billingCycleEndAt", "epochMs"),
      f("isAdvancePayment", "boolean", "parte de un pago adelantado"),
      f(
        "paymentMethod",
        "string",
        "cash | bank_transfer | proof_upload | bonification | mercadopago_recurring | mercadopago_checkout",
      ),
      f("status", "string", "pending | in_review | approved | declined"),
      f("createdAt", "epochMs"),
      f("reviewedAt", "epochMs"),
    ],
    examples: [
      'cobrado en un mes: mode "aggregate", filters [{field:"billingPeriod",op:"eq",value:"2026-09"},{field:"status",op:"eq",value:"approved"}], aggregates [{op:"sum",field:"totalAmountArs",as:"cobradoArs"}]',
    ],
  },
  {
    dataset: "overdueMembers",
    access: "admin",
    description:
      "Socios que deben el período actual. Derivado: incluye cuotas pendientes, rechazadas y las que nunca se registraron.",
    fields: [
      MEMBER,
      f("billingPeriod", "period", "siempre el período actual"),
      f("situation", "string", "missing | pending | declined | in_review"),
      f(
        "unpaid",
        "boolean",
        "false solo para in_review (ya pagó, falta revisar)",
      ),
      f("subscriptionStatus", "string"),
      f("suspended", "boolean"),
      f("amountDueArs", "number"),
      f("dueAt", "epochMs"),
      f("daysOverdue", "number", "null si todavía no venció"),
      f("paymentMethod", "string"),
    ],
    examples: [
      'quiénes deben: filters [{field:"unpaid",op:"eq",value:true}], sort {field:"daysOverdue",direction:"desc"}',
    ],
  },
  {
    dataset: "memberPaymentTransactions",
    access: "admin",
    description:
      "Cobros procesados por MercadoPago (socio → gimnasio), con comisiones y neto.",
    fields: [
      MEMBER,
      f("kind", "string", "recurring | advance"),
      f(
        "status",
        "string",
        "pending | approved | rejected | cancelled | refunded | charged_back | unknown",
      ),
      f("grossAmountArs", "number"),
      f("providerFeeArs", "number", "comisión de MercadoPago"),
      f("platformFeeArs", "number", "comisión de MAT"),
      f("gymNetAmountArs", "number", "lo que efectivamente recibe el gimnasio"),
      f("providerApprovedAt", "epochMs"),
      f("requiresAttention", "boolean"),
      f("attentionReason", "string"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "recurringAgreements",
    access: "admin",
    description:
      "Débitos automáticos de socios: estado, monto y próximo cobro.",
    fields: [
      MEMBER,
      f(
        "status",
        "string",
        "active | retrying | paused_bonification | cancellation_scheduled | cancelled | failed | pending_authorization | pending_first_payment",
      ),
      f("amountArs", "number"),
      f("familyMemberCount", "number"),
      f("lastPaymentStatus", "string"),
      f("nextChargeAt", "epochMs"),
      f("currentPeriodStart", "epochMs"),
      f("currentPeriodEnd", "epochMs"),
      f("firstFailureAt", "epochMs"),
      f("graceUntil", "epochMs"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "bonifications",
    access: "admin",
    description: "Bonificaciones y descuentos otorgados sobre la cuota.",
    fields: [
      MEMBER,
      f("plan", "string"),
      f("discountType", "string", "percentage | fixed | full"),
      f("discountValue", "number"),
      f(
        "reason",
        "string",
        "friend_and_family | trainer | employee | sponsor | other",
      ),
      f("status", "string", "active | revoked"),
      f("createdAt", "epochMs"),
      f("revokedAt", "epochMs"),
    ],
  },
  {
    dataset: "finance",
    access: "admin",
    description:
      "Libro de ingresos y egresos del gimnasio. Las transacciones anuladas ya están excluidas.",
    fields: [
      f("type", "string", "income | expense"),
      f("title", "string"),
      f("category", "string"),
      f("amountArs", "number"),
      f("occurredOn", "date"),
      f("period", "period", "filtrar por acá es lo más eficiente"),
      f("paymentMethod", "string"),
      f("source", "string", "manual | recurring"),
      f("status", "string", "siempre active"),
    ],
    examples: [
      'egresos por categoría de un mes: mode "aggregate", filters [{field:"period",op:"eq",value:"2026-09"},{field:"type",op:"eq",value:"expense"}], groupBy "category", aggregates [{op:"sum",field:"amountArs",as:"totalArs"}]',
    ],
  },
  {
    dataset: "financeRecurringRules",
    access: "admin",
    description:
      "Reglas de ingresos/egresos recurrentes (alquiler, servicios, etc.).",
    fields: [
      f("type", "string", "income | expense"),
      f("title", "string"),
      f("category", "string"),
      f("amountArs", "number"),
      f("frequency", "string"),
      f("dayOfMonth", "number"),
      f("startPeriod", "period"),
      f("endPeriod", "period"),
      f("nextDuePeriod", "period"),
      f("status", "string", "active | paused | cancelled"),
    ],
  },
  {
    dataset: "classes",
    access: "staff",
    description: "Catálogo de clases de la organización.",
    fields: [
      f("name", "string"),
      f("description", "string"),
      f("capacity", "number"),
      f("trainer", "string"),
      f("isRecurring", "boolean"),
      f("isActive", "boolean"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "schedules",
    access: "staff",
    description: "Horarios concretos de clases, con ocupación y cupos libres.",
    fields: [
      f("className", "string"),
      f("startTime", "epochMs"),
      f("endTime", "epochMs"),
      f("capacity", "number"),
      f("reservations", "number"),
      f("availableSpots", "number"),
      f("status", "string", "scheduled | cancelled | completed"),
      f("inCharge", "string"),
    ],
    examples: [
      'próximas clases: dateRange {field:"startTime", from:<ahora en ms>}, sort {field:"startTime",direction:"asc"}',
    ],
  },
  {
    dataset: "attendance",
    access: "staff",
    description: "Reservas de clase y su resultado (asistió, faltó, canceló).",
    fields: [
      MEMBER,
      f("className", "string"),
      f("startTime", "epochMs"),
      f("status", "string", "confirmed | cancelled | attended | no_show"),
      f("checkedInAt", "epochMs"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "planifications",
    access: "staff",
    description: "Planificaciones de entrenamiento creadas en la organización.",
    fields: [
      f("name", "string"),
      f("description", "string"),
      f("isTemplate", "boolean"),
      f("isArchived", "boolean"),
      f("createdBy", "string"),
      f("createdAt", "epochMs"),
      f("updatedAt", "epochMs"),
    ],
  },
  {
    dataset: "assignments",
    access: "staff",
    description: "Planificaciones asignadas a cada socio.",
    fields: [
      MEMBER,
      f("planification", "string"),
      f("assignedBy", "string"),
      f("status", "string"),
      f("startDate", "epochMs"),
      f("endDate", "epochMs"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "workoutSessions",
    access: "staff",
    description: "Sesiones de entrenamiento registradas por los socios.",
    fields: [
      MEMBER,
      f("performedOn", "date"),
      f("status", "string"),
      f("effortRating", "number", "RPE 1-10"),
      f("mood", "string"),
      f("memberNote", "string"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "exerciseLogs",
    access: "staff",
    description: "Series registradas por ejercicio dentro de cada sesión.",
    fields: [
      MEMBER,
      f("performedOn", "date"),
      f("exercise", "string"),
      f("sets", "number"),
      f("reps", "number"),
      f("weight", "number"),
      f("timeSeconds", "number"),
      f("comment", "string"),
    ],
  },
  {
    dataset: "exercises",
    access: "staff",
    description: "Biblioteca de ejercicios disponible.",
    fields: [
      f("name", "string"),
      f("description", "string"),
      f("category", "string"),
      f("muscleGroups", "string", "lista separada por comas"),
      f("equipment", "string"),
      f("isStandard", "boolean"),
      f("createdAt", "epochMs"),
    ],
  },
  {
    dataset: "staffShifts",
    access: "admin",
    description: "Turnos del staff y horas trabajadas.",
    fields: [
      STAFF,
      f("startTime", "epochMs"),
      f("endTime", "epochMs"),
      f("durationHours", "number"),
      f("status", "string"),
      f("notes", "string"),
    ],
  },
  {
    dataset: "payroll",
    access: "admin",
    description: "Pagos de sueldos y comisiones al staff, por período.",
    fields: [
      STAFF,
      f("period", "period"),
      f("payrollType", "string", "hourly | monthly"),
      f("hours", "number"),
      f("classesInCharge", "number"),
      f("commissionPercentage", "number"),
      f("amountArs", "number"),
      f("occurredOn", "date"),
      f("paymentMethod", "string"),
      f("paidAt", "epochMs"),
    ],
  },
  {
    dataset: "rewards",
    access: "staff",
    description: "Cuentas de puntos del programa de recompensas.",
    fields: [
      MEMBER,
      f("balance", "number"),
      f("lifetimeEarned", "number"),
      f("lifetimeRedeemed", "number"),
      f("status", "string", "active | frozen"),
      f("updatedAt", "epochMs"),
    ],
  },
  {
    dataset: "checkIns",
    access: "staff",
    description: "Check-ins de socios por QR en la recepción.",
    fields: [
      MEMBER,
      f("localDate", "date"),
      f("checkedInAt", "epochMs"),
      f("source", "string"),
      f("status", "string"),
      f("reasonCode", "string"),
      f("pointsAwarded", "number"),
    ],
  },
  {
    dataset: "redemptions",
    access: "staff",
    description: "Canjes de recompensas por puntos.",
    fields: [
      MEMBER,
      f("reward", "string"),
      f("pointsCost", "number"),
      f("status", "string"),
      f("createdAt", "epochMs"),
      f("fulfilledAt", "epochMs"),
      f("cancelledAt", "epochMs"),
    ],
  },
  {
    dataset: "organizationSettings",
    access: "admin",
    description: "Módulos habilitados y preferencias de la organización.",
    fields: [
      f("planificationsEnabled", "boolean"),
      f("classesEnabled", "boolean"),
      f("financeEnabled", "boolean"),
      f("memberAutoApproval", "boolean"),
      f("showAiPet", "boolean"),
      f("rewardsEnabled", "boolean"),
    ],
  },
];

export type ReportEntry = {
  report: string;
  access: CatalogAccess;
  description: string;
  args?: string;
};

/**
 * Rollups computed over every row, unlike `queryMat` which reads at most the
 * newest 1000. Anything phrased as a total, a rate or a trend belongs here.
 */
export const REPORT_CATALOG: ReportEntry[] = [
  {
    report: "financeSummary",
    access: "admin",
    description:
      "Ingresos, egresos y resultado neto de un período, sobre el libro completo.",
    args: 'period?: "YYYY-MM" (por defecto, el mes actual)',
  },
  {
    report: "membershipRevenue",
    access: "admin",
    description:
      "Facturación de cuotas: esperado vs. cobrado, tasa de cobranza, morosidad, bonificaciones, desglose por plan y comparación con el mes anterior.",
    args: 'selectedPeriod?: "YYYY-MM"',
  },
  {
    report: "memberPaymentsHealth",
    access: "admin",
    description:
      "Salud de los cobros por MercadoPago: volumen bruto y neto, aprobados/rechazados, conversión del checkout, débitos en reintento y comisiones.",
    args: "sinceDays?: number (por defecto 30)",
  },
  {
    report: "payrollSummary",
    access: "admin",
    description:
      "Costo de staff del período: horas, clases, comisiones y total a pagar.",
    args: 'period?: "YYYY-MM" (por defecto, el mes actual)',
  },
  {
    report: "churn",
    access: "admin",
    description:
      "Altas, bajas, churn y retención por período, con comparación contra el período previo.",
    args: 'selectedPeriod?: "YYYY-MM"',
  },
  {
    report: "activeMembersHistory",
    access: "staff",
    description: "Cantidad de socios activos mes a mes.",
    args: "monthsCount?: number (1-12, por defecto 6)",
  },
  {
    report: "classMetrics",
    access: "admin",
    description:
      "Ocupación, asistencia, no-show, clases más populares y horarios más cargados.",
  },
  {
    report: "memberAttendance",
    access: "staff",
    description:
      "Ranking de asistencia por socio y socios dormidos (sin actividad reciente).",
    args: "rangeDays?: number (0 = historia completa)",
  },
  {
    report: "memberPaymentStatus",
    access: "staff",
    description:
      "Situación de pago de un socio puntual: plan, período actual, monto y estado.",
    args: "member: string (nombre del socio)",
  },
];

export const DATASET_NAMES = DATASET_CATALOG.map((entry) => entry.dataset);
export const REPORT_NAMES = REPORT_CATALOG.map((entry) => entry.report);

export function catalogForRole(role: string) {
  const allowed = (access: CatalogAccess) =>
    role === "admin" || access === "staff";
  return {
    datasets: DATASET_CATALOG.filter((entry) => allowed(entry.access)),
    reports: REPORT_CATALOG.filter((entry) => allowed(entry.access)),
  };
}

/** Field names of one dataset, for the AI_UNKNOWN_FIELD recovery hint. */
export function fieldsForDataset(dataset: string): string[] {
  return (
    DATASET_CATALOG.find((entry) => entry.dataset === dataset)?.fields.map(
      (field) => field.name,
    ) ?? []
  );
}

/** Compact schema block rendered into the tool description. */
export function renderCatalogForPrompt(role: string): string {
  const { datasets, reports } = catalogForRole(role);
  const datasetLines = datasets.map(
    (entry) =>
      `- ${entry.dataset}: ${entry.description} Campos: ${entry.fields
        .map((field) =>
          field.type === "epochMs"
            ? `${field.name}(ms)`
            : field.type === "period"
              ? `${field.name}(YYYY-MM)`
              : field.type === "date"
                ? `${field.name}(YYYY-MM-DD)`
                : field.name,
        )
        .join(", ")}.`,
  );
  const reportLines = reports.map(
    (entry) =>
      `- ${entry.report}: ${entry.description}${entry.args ? ` Args: ${entry.args}.` : ""}`,
  );
  return [
    'DATASETS (source "organization", filas crudas, lee como máximo las 1000 más recientes):',
    ...datasetLines,
    "",
    'REPORTES (source "report", calculados sobre todas las filas: usalos para totales, tasas y tendencias):',
    ...reportLines,
  ].join("\n");
}

const TOOL_ERROR_CODES = [
  "AI_UNKNOWN_DATASET",
  "AI_UNKNOWN_REPORT",
  "AI_UNKNOWN_FIELD",
  "AI_DATASET_FORBIDDEN",
  "AI_REPORT_FORBIDDEN",
  "AI_MEMBER_NOT_FOUND",
  "AI_TOOL_LIMIT",
  "AI_INVALID_OPERATOR",
  "AI_INVALID_AGGREGATE",
  "AI_INVALID",
] as const;

export function classifyToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    TOOL_ERROR_CODES.find((code) => message.includes(code)) ?? "AI_TOOL_ERROR"
  );
}

/**
 * A thrown error inside `execute` aborts the whole stream, so the user sees
 * nothing at all — one bad field name used to sink an entire answer. Errors are
 * returned as data instead, with enough detail for the model to fix its query
 * on the next step.
 */
export function toolErrorHint(
  code: string,
  input: { source: string; dataset?: string },
) {
  switch (code) {
    case "AI_UNKNOWN_FIELD": {
      const fields = input.dataset ? fieldsForDataset(input.dataset) : [];
      return fields.length
        ? `Campos válidos de ${input.dataset}: ${fields.join(", ")}. Reintentá una sola vez con uno de estos.`
        : 'Consultá source "schema" para ver los campos válidos y reintentá una sola vez.';
    }
    case "AI_UNKNOWN_DATASET":
    case "AI_UNKNOWN_REPORT":
      return 'Consultá source "schema" para ver qué hay disponible.';
    case "AI_DATASET_FORBIDDEN":
    case "AI_REPORT_FORBIDDEN":
      return "El rol del usuario no tiene acceso a estos datos. Decíselo y no reintentes.";
    case "AI_MEMBER_NOT_FOUND":
      return "Ningún socio coincide con ese nombre. Pedí el nombre completo o buscalo en el dataset members.";
    case "AI_TOOL_LIMIT":
      return "Se agotaron las consultas de este turno. Respondé con lo que ya tenés.";
    default:
      return "No se pudo ejecutar la consulta. Respondé con lo que tengas o pedí una aclaración.";
  }
}
