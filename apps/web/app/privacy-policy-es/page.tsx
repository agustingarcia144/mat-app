import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Política de Privacidad | Mat",
  description: "Política de Privacidad de Mat Gestión.",
};

export default function PrivacyPolicyEsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="bg-zinc-50 dark:bg-zinc-950 border-zinc-200/70 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-900 dark:text-zinc-100">
            Política de Privacidad
          </CardTitle>
          <CardDescription className="text-zinc-600 dark:text-zinc-400">
            Última actualización: 17 de marzo de 2026
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-base leading-7 text-zinc-800 dark:text-zinc-100">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              1. Resumen
            </h2>
            <p>
              Mat Gestión (“nosotros”, “nuestro”) ofrece una aplicación móvil y
              web que ayuda a gimnasios y a sus miembros a gestionar horarios de
              clases, reservas y planes de entrenamiento. Esta Política de
              Privacidad explica cómo recopilamos, usamos y compartimos la
              información personal cuando usás la app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              2. Información que recopilamos
            </h2>
            <p>
              Según cómo use la app, podemos recopilar las siguientes categorías
              de información:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Información de la cuenta:</span>{" "}
                como nombre, dirección de correo electrónico y datos de perfil
                que se proporcionan durante el registro o se administran
                mediante nuestro proveedor de autenticación.
              </li>
              <li>
                <span className="font-medium">Datos de clases y reservas:</span>{" "}
                como las reservas que realizás, las clases a las que asistís y
                la información relacionada con el cronograma.
              </li>
              <li>
                <span className="font-medium">
                  Datos de entrenamiento y ejercicios:
                </span>{" "}
                como sesiones de entrenamiento, detalles de ejercicios, notas y
                el progreso que registrás en la app.
              </li>
              <li>
                <span className="font-medium">
                  Datos del dispositivo y notificaciones:
                </span>{" "}
                si habilitás notificaciones, podemos guardar un token del
                dispositivo utilizado para enviar recordatorios (por ejemplo,
                recordatorios de clases y asistencia).
              </li>
              <li>
                <span className="font-medium">Enlaces de video:</span> los
                ejercicios pueden incluir URLs de videos de YouTube que se
                embeben o se reproducen mediante los servicios de YouTube.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              3. Cómo usamos tu información
            </h2>
            <p>
              Usamos información personal para operar y mejorar la app, por
              ejemplo:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Brindarte acceso a tu membresía, clases y reservas.</li>
              <li>
                Enviar notificaciones push y recordatorios cuando corresponda.
              </li>
              <li>Permitirte revisar y completar sesiones de entrenamiento.</li>
              <li>
                Mantener la seguridad, prevenir abusos y solucionar problemas.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              4. Compartición de información
            </h2>
            <p>
              Podemos compartir información con proveedores de servicios que nos
              ayudan a brindar la app, como:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Proveedor de autenticación</span>{" "}
                (por ej., Clerk) para el inicio de sesión y la gestión de
                usuarios.
              </li>
              <li>
                <span className="font-medium">
                  Proveedores de infraestructura y backend
                </span>{" "}
                para almacenar y procesar los datos de la aplicación.
              </li>
              <li>
                <span className="font-medium">Servicios de notificaciones</span>{" "}
                utilizados para entregar notificaciones push.
              </li>
              <li>
                <span className="font-medium">YouTube</span> para videos de
                ejercicios embebidos mediante el reproductor de YouTube.
              </li>
            </ul>
            <p>
              No vendemos tu información personal. También podemos compartir
              información cuando sea necesario para cumplir obligaciones legales
              o para proteger derechos y seguridad.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              5. Retención de datos
            </h2>
            <p>
              Conservamos la información personal únicamente durante el tiempo
              necesario para brindar la app y por fines comerciales legítimos,
              incluyendo el mantenimiento de registros para seguridad y
              cumplimiento legal.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              6. Seguridad
            </h2>
            <p>
              Implementamos medidas administrativas, técnicas y organizacionales
              razonables para ayudar a proteger la información personal. Sin
              embargo, ningún método de transmisión o almacenamiento es 100%
              seguro.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              7. Tus derechos
            </h2>
            <p>
              Dependiendo de tu ubicación, podés tener derechos sobre el acceso,
              la corrección, la eliminación o la limitación del procesamiento de
              la información personal. Para ejercer cualquiera de estos
              derechos, contactanos usando la información a continuación.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              8. Contacto
            </h2>
            <p>
              Si tenés preguntas sobre esta Política de Privacidad o la app,
              contactanos a:{" "}
              <a className="underline" href="mailto:mat.gym.app@gmail.com">
                mat.gym.app@gmail.com
              </a>
              .
            </p>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
