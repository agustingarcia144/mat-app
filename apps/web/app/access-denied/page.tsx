
export default function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Acceso denegado</h1>
      <p className="text-muted-foreground">
        Esta versión web está disponible solo para administradores y entrenadores.
      </p>
    </main>
  )
}
