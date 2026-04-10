import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Account Deletion | Mat Gestion",
  description:
    "How to request account deletion and how Mat Gestion handles data deletion and retention.",
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="border-zinc-200/70 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-zinc-900 dark:text-zinc-100">
            Account Deletion Request
          </CardTitle>
          <CardDescription className="text-zinc-600 dark:text-zinc-400">
            Last updated: March 26, 2026
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-base leading-7 text-zinc-800 dark:text-zinc-100">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              How to request account deletion
            </h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Send an email to{" "}
                <a className="underline" href="mailto:mat.gym.app@gmail.com">
                  mat.gym.app@gmail.com
                </a>{" "}
                from the same email associated with your account.
              </li>
              <li>
                Use the subject:{" "}
                <span className="font-medium">Delete my account</span>.
              </li>
              <li>
                Include your full name and organization (if you belong to one).
              </li>
            </ol>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              We may request additional verification before processing deletion.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              What data is deleted
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Account profile data (name, email, and profile fields).</li>
              <li>
                Personal app activity associated with your account, including
                class reservations and workout records.
              </li>
              <li>
                Organization membership links associated with your user account.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              What data may be retained
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Minimal security and legal compliance logs may be retained for
                up to <span className="font-medium">90 days</span>.
              </li>
              <li>
                Financial, fraud-prevention, or legally required records may be
                retained only for the period required by applicable law.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Processing timeline
            </h2>
            <p>
              We process account deletion requests within{" "}
              <span className="font-medium">30 days</span> after successful
              identity verification.
            </p>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
