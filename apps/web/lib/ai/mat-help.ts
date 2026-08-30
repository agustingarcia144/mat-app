export type MatHelpRole = "admin" | "trainer" | "employee";

type HelpEntry = {
  role: "staff" | "admin";
  module: string;
  route: string;
  summary: string;
  instructions: string;
  keywords: string[];
};

const MAT_HELP_CATALOG: HelpEntry[] = [
  {
    role: "staff",
    module: "Inicio",
    route: "/dashboard",
    summary: "Resumen de la actividad de la organización y accesos rápidos.",
    instructions: "Abre Inicio desde el menú lateral para ver las acciones y métricas disponibles para tu rol.",
    keywords: ["inicio", "dashboard", "resumen", "actividad", "métricas"],
  },
  {
    role: "staff",
    module: "Miembros",
    route: "/dashboard/members",
    summary: "Consulta miembros, estado, responsable y datos de contacto.",
    instructions: "En Miembros puedes buscar una persona, abrir su perfil y consultar su información operativa.",
    keywords: ["miembro", "socio", "alumno", "contacto", "responsable", "perfil"],
  },
  {
    role: "staff",
    module: "Planificaciones",
    route: "/dashboard/planifications",
    summary: "Crea y asigna rutinas de entrenamiento.",
    instructions: "Abre Planificaciones, crea una planificación o plantilla y luego asígnala desde el perfil del miembro.",
    keywords: ["planificación", "rutina", "entrenamiento", "asignar", "plantilla"],
  },
  {
    role: "staff",
    module: "Ejercicios",
    route: "/dashboard/exercises",
    summary: "Biblioteca de ejercicios de la organización.",
    instructions: "Usa Ejercicios para buscar, revisar o crear ejercicios que luego se incorporan a las planificaciones.",
    keywords: ["ejercicio", "biblioteca", "movimiento", "video"],
  },
  {
    role: "staff",
    module: "Clases",
    route: "/dashboard/classes",
    summary: "Gestiona clases, horarios, cupos, reservas y asistencia.",
    instructions: "En Clases puedes abrir un horario para revisar cupos y participantes, y registrar asistencia.",
    keywords: ["clase", "horario", "cupo", "reserva", "asistencia", "check-in"],
  },
  {
    role: "staff",
    module: "Recompensas",
    route: "/dashboard/rewards",
    summary: "Gestiona puntos, recompensas, registros y canjes.",
    instructions: "Abre Recompensas para consultar actividad, configurar premios y revisar canjes según tus permisos.",
    keywords: ["recompensa", "puntos", "premio", "canje", "registro"],
  },
  {
    role: "admin",
    module: "Pagos",
    route: "/dashboard/payments",
    summary: "Administra planes, suscripciones y pagos de miembros.",
    instructions: "En Pagos puedes revisar comprobantes, estados de pago y suscripciones. Esta sección es solo para administradores.",
    keywords: ["pago", "cuota", "comprobante", "suscripción", "plan", "deuda"],
  },
  {
    role: "admin",
    module: "Finanzas",
    route: "/dashboard/finance",
    summary: "Consulta y registra ingresos y egresos internos.",
    instructions: "Abre Finanzas para filtrar movimientos y revisar totales. Esta sección es solo para administradores.",
    keywords: ["finanza", "ingreso", "egreso", "gasto", "balance", "caja"],
  },
  {
    role: "admin",
    module: "Personal",
    route: "/dashboard/staff",
    summary: "Gestiona turnos, horas y liquidaciones del personal.",
    instructions: "Usa Personal para consultar turnos y liquidaciones. La información salarial es solo para administradores.",
    keywords: ["personal", "empleado", "turno", "horas", "nómina", "liquidación", "salario"],
  },
  {
    role: "admin",
    module: "Configuración",
    route: "/dashboard/settings",
    summary: "Configura la organización, sus módulos y la visibilidad de Mati.",
    instructions: "En Configuración puedes cambiar datos y módulos de la organización. Solo un administrador puede guardar cambios.",
    keywords: ["configuración", "organización", "módulo", "mati", "mascota", "ocultar"],
  },
  {
    role: "admin",
    module: "Facturación",
    route: "/dashboard/billing",
    summary: "Consulta el plan y el estado de facturación de MAT.",
    instructions: "Abre Facturación para consultar o administrar el plan de la organización.",
    keywords: ["facturación", "billing", "plan", "pro", "trial", "suscripción"],
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function searchMatHelp(query: string, role: MatHelpRole) {
  const terms = normalize(query)
    .split(/\s+/)
    .filter((term) => term.length > 1);

  return MAT_HELP_CATALOG.filter(
    (entry) => entry.role === "staff" || role === "admin",
  )
    .map((entry) => {
      const haystack = normalize(
        [entry.module, entry.summary, entry.instructions, ...entry.keywords].join(" "),
      );
      const score = terms.reduce(
        (total, term) => total + (haystack.includes(term) ? 1 : 0),
        0,
      );
      return { entry, score };
    })
    .filter(({ score }) => score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry }) => ({
      module: entry.module,
      route: entry.route,
      summary: entry.summary,
      instructions: entry.instructions,
    }));
}
