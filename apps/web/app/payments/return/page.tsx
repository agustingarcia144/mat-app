import type { Metadata } from "next";

const DEFAULT_APP_STORE_URL =
  "https://apps.apple.com/ar/app/mat-gestion/id6760161458";
const DEFAULT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.agusstingarcia144.matapp";

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || DEFAULT_APP_STORE_URL;
const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || DEFAULT_PLAY_STORE_URL;

export const metadata: Metadata = {
  title: "Pago | Mat Gestión",
  // A member's payment link has no business in a search index.
  robots: { index: false, follow: false },
};

type PaymentStatus =
  | "approved"
  | "processing"
  | "failed"
  | "expired"
  | "unknown";

function resolveConvexHttpUrl(): string | null {
  if (process.env.CONVEX_HTTP_URL) return process.env.CONVEX_HTTP_URL;
  // Derive from the API URL: *.convex.cloud → *.convex.site (HTTP actions endpoint)
  const apiUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (apiUrl)
    return apiUrl.replace(/\.convex\.cloud(\/.*)?$/, ".convex.site$1");
  return null;
}

async function getPaymentStatus(sessionId: string): Promise<PaymentStatus> {
  const base = resolveConvexHttpUrl();
  if (!base) {
    console.error("Neither CONVEX_HTTP_URL nor NEXT_PUBLIC_CONVEX_URL is set");
    return "unknown";
  }

  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/member-payments/return/${encodeURIComponent(sessionId)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return "unknown";
    const data = (await res.json()) as { status?: PaymentStatus };
    return data.status ?? "unknown";
  } catch (error) {
    console.error("Payment status fetch failed:", error);
    return "unknown";
  }
}

const COPY: Record<
  PaymentStatus,
  { emoji: string; title: string; body: string }
> = {
  approved: {
    emoji: "✅",
    title: "¡Listo! Recibimos tu pago",
    body: "Ya tenés acceso a las clases. Abrí la app para ver tu plan.",
  },
  processing: {
    emoji: "⏳",
    title: "Estamos confirmando tu pago",
    body: "Mercado Pago todavía no nos confirmó la operación. Abrí la app: apenas se acredite vas a ver tu plan activo.",
  },
  failed: {
    emoji: "⚠️",
    title: "No pudimos completar el pago",
    body: "El pago no se completó. Podés intentarlo de nuevo desde la app.",
  },
  expired: {
    emoji: "⚠️",
    title: "El pago venció",
    body: "Pasó demasiado tiempo desde que lo iniciaste. Empezá de nuevo desde la app.",
  },
  unknown: {
    emoji: "📱",
    title: "Volvé a la app",
    body: "Abrí Mat Gestión para ver el estado de tu pago.",
  },
};

/**
 * Web fallback for the Mercado Pago return link.
 *
 * Members finish checkout in a browser, and the app normally takes the return
 * link back over. When it cannot — the app is not installed, app links are not
 * verified yet, or the browser dropped the hand-off — they land here instead of
 * on a 404 wondering where their money went.
 *
 * The page reports state and offers a way back. It decides nothing: access is
 * granted by an approved payment verified against Mercado Pago on the server,
 * never by anything that happens in this browser.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  const sessionId = typeof session === "string" ? session.trim() : "";

  const status: PaymentStatus = sessionId
    ? await getPaymentStatus(sessionId)
    : "unknown";
  const copy = COPY[status];

  const schemeUrl = sessionId
    ? `mat-app://payments/return?session=${encodeURIComponent(sessionId)}`
    : "mat-app://payments/return";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-zinc-200 dark:bg-zinc-800 mb-6 flex items-center justify-center text-3xl">
          <span aria-hidden="true">{copy.emoji}</span>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {copy.title}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">{copy.body}</p>

        <a
          href={schemeUrl}
          className="flex items-center justify-center h-12 w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
        >
          Abrir Mat Gestión
        </a>

        <p className="mt-8 mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          ¿Todavía no tenés la app?
        </p>
        <div className="flex flex-col gap-3 w-full">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/appstore.svg"
              alt=""
              className="h-5 w-5 dark:invert"
              aria-hidden="true"
            />
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/googleplay.svg"
              alt=""
              className="h-5 w-5 dark:invert"
              aria-hidden="true"
            />
            Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
