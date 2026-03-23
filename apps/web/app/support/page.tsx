import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = {
  title: 'Soporte | Mat Gestion',
  description: 'Canales de soporte para usuarios de Mat Gestion.',
}

export default function SupportPage() {
  return (
    <main className='mx-auto w-full max-w-3xl px-4 py-10'>
      <Card className='border-zinc-200/70 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'>
        <CardHeader>
          <CardTitle className='text-zinc-900 dark:text-zinc-100'>
            Soporte de Mat Gestion
          </CardTitle>
          <CardDescription className='text-zinc-600 dark:text-zinc-400'>
            Si necesitas ayuda con la app, contactanos y te respondemos lo antes
            posible.
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-6 text-base leading-7 text-zinc-800 dark:text-zinc-100'>
          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Contacto
            </h2>
            <p>
              Escribinos a:{' '}
              <a className='underline' href='mailto:mat.gym.app@gmail.com'>
                mat.gym.app@gmail.com
              </a>
            </p>
            <p className='text-sm text-zinc-600 dark:text-zinc-400'>
              Tiempo de respuesta estimado: 24 a 72 horas habiles.
            </p>
          </section>

          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Inclui esta informacion en tu mensaje
            </h2>
            <ul className='list-disc space-y-1 pl-5'>
              <li>Tu nombre y email de la cuenta.</li>
              <li>Dispositivo y version del sistema operativo.</li>
              <li>Descripcion breve del problema.</li>
              <li>
                Capturas de pantalla o pasos para reproducirlo (si aplica).
              </li>
            </ul>
          </section>

          <section className='space-y-2'>
            <h2 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
              Tipos de ayuda
            </h2>
            <ul className='list-disc space-y-1 pl-5'>
              <li>Problemas para iniciar sesion.</li>
              <li>Reservas y cancelaciones de clases.</li>
              <li>Errores de sincronizacion o carga de datos.</li>
              <li>Consultas sobre privacidad y manejo de datos.</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </main>
  )
}

