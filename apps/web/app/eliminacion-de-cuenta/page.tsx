import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = {
  title: 'Eliminacion de Cuenta | Mat Gestion',
  description:
    'Como solicitar la eliminacion de cuenta y como Mat Gestion gestiona la eliminacion y retencion de datos.',
}

export default function EliminacionDeCuentaPage() {
  return (
    <main className='mx-auto w-full max-w-3xl px-4 py-10'>
      <Card className='border-zinc-200/70 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'>
        <CardHeader>
          <CardTitle className='text-zinc-900 dark:text-zinc-100'>
            Solicitud de eliminacion de cuenta
          </CardTitle>
          <CardDescription className='text-zinc-600 dark:text-zinc-400'>
            Ultima actualizacion: 26 de marzo de 2026
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-6 text-base leading-7 text-zinc-800 dark:text-zinc-100'>
          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Como solicitar la eliminacion
            </h2>
            <ol className='list-decimal space-y-1 pl-5'>
              <li>
                Envia un correo a{' '}
                <a className='underline' href='mailto:mat.gym.app@gmail.com'>
                  mat.gym.app@gmail.com
                </a>{' '}
                desde el mismo email asociado a tu cuenta.
              </li>
              <li>
                Usa el asunto: <span className='font-medium'>Eliminar mi cuenta</span>.
              </li>
              <li>
                Inclui tu nombre completo y organizacion (si corresponde).
              </li>
            </ol>
            <p className='text-sm text-zinc-600 dark:text-zinc-400'>
              Podemos solicitar una verificacion adicional antes de procesar la
              eliminacion.
            </p>
          </section>

          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Datos que se eliminan
            </h2>
            <ul className='list-disc space-y-1 pl-5'>
              <li>Datos de perfil de cuenta (nombre, email y campos de perfil).</li>
              <li>
                Actividad personal en la app asociada a tu cuenta, incluyendo
                reservas de clases y registros de entrenamiento.
              </li>
              <li>
                Vinculos de membresia a organizaciones asociados a tu usuario.
              </li>
            </ul>
          </section>

          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Datos que pueden conservarse
            </h2>
            <ul className='list-disc space-y-1 pl-5'>
              <li>
                Registros minimos de seguridad y cumplimiento legal, por hasta{' '}
                <span className='font-medium'>90 dias</span>.
              </li>
              <li>
                Registros financieros, antifraude o legalmente requeridos solo por
                el plazo exigido por la normativa aplicable.
              </li>
            </ul>
          </section>

          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Plazo de procesamiento
            </h2>
            <p>
              Procesamos las solicitudes de eliminacion de cuenta dentro de{' '}
              <span className='font-medium'>30 dias</span> despues de verificar la
              identidad.
            </p>
          </section>
        </CardContent>
      </Card>
    </main>
  )
}
