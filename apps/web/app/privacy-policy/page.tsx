import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = {
  title: 'Privacy Policy | Mat',
  description: 'Privacy Policy for Mat Gestion.',
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="bg-zinc-50 dark:bg-zinc-950 border-zinc-200/70 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-900 dark:text-zinc-100">Privacy Policy</CardTitle>
          <CardDescription className="text-zinc-600 dark:text-zinc-400">
            Last updated: March 17, 2026
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-base leading-7 text-zinc-800 dark:text-zinc-100">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              1. Overview
            </h2>
            <p>
              Mat Gestion (“we”, “us”, “our”) provides a mobile and web
              application that helps gyms and their members manage class
              schedules, reservations, and workout plans. This Privacy Policy
              explains how we collect, use, and share personal information when
              you use the App.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              2. Information we collect
            </h2>
            <p>
              Depending on how you use the App, we may collect the following
              categories of information:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Account information:</span> such
                as name, email address, and profile details provided during sign
                up or managed by our authentication provider.
              </li>
              <li>
                <span className="font-medium">Class and reservation data:</span>{' '}
                such as reservations you make, the classes you attend, and
                related scheduling information.
              </li>
              <li>
                <span className="font-medium">Workout and exercise data:</span>{' '}
                such as workout sessions, exercise details, notes, and progress
                you record in the App.
              </li>
              <li>
                <span className="font-medium">
                  Device and push notification data:
                </span>{' '}
                if you enable notifications, we may store a device token used to
                send reminders (e.g., class reminders and attendance reminders).
              </li>
              <li>
                <span className="font-medium">Video links:</span> exercises may
                include YouTube video URLs that are embedded/played through
                YouTube’s services.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              3. How we use your information
            </h2>
            <p>
              We use personal information to operate and improve the App,
              including to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Provide access to your gym membership, classes, and
                reservations.
              </li>
              <li>Send push notifications and reminders when applicable.</li>
              <li>Allow you to review and complete workout sessions.</li>
              <li>
                Maintain security, prevent abuse, and troubleshoot issues.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              4. Sharing of information
            </h2>
            <p>
              We may share information with service providers who help us
              deliver the App, such as:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Authentication provider</span>{' '}
                (e.g., Clerk) for account sign-in and user management.
              </li>
              <li>
                <span className="font-medium">Cloud and backend providers</span>{' '}
                (e.g., our backend services) to store and process application
                data.
              </li>
              <li>
                <span className="font-medium">Notification services</span> used
                for delivering push notifications.
              </li>
              <li>
                <span className="font-medium">YouTube</span> for embedded
                exercise videos via YouTube’s player.
              </li>
            </ul>
            <p>
              We do not sell your personal information. We may also share
              information when required to comply with legal obligations, or to
              protect rights and safety.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              5. Data retention
            </h2>
            <p>
              We keep personal information only as long as necessary to provide
              the App and for legitimate business purposes, including
              maintaining records for security and legal compliance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              6. Security
            </h2>
            <p>
              We implement reasonable administrative, technical, and
              organizational measures to help protect personal information.
              However, no method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              7. Your rights
            </h2>
            <p>
              Depending on your location, you may have rights regarding access
              to, correction of, deletion of, or restriction of processing of
              your personal information. To exercise any of these rights,
              contact us using the information below.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              8. Contact us
            </h2>
            <p>
              If you have questions about this Privacy Policy or the App,
              contact us at:{' '}
              <a className="underline" href="mailto:mat.gym.app@gmail.com">
                mat.gym.app@gmail.com
              </a>
              .
            </p>
          </section>
        </CardContent>
      </Card>
    </main>
  )
}
