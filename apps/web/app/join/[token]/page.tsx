import { notFound } from "next/navigation";

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ?? "https://apps.apple.com/app";
const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL ??
  "https://play.google.com/store/apps";

type JoinPreview = { name: string; logoUrl?: string };
type JoinError = { error: string };

function resolveConvexHttpUrl(): string | null {
  if (process.env.CONVEX_HTTP_URL) return process.env.CONVEX_HTTP_URL;
  // Derive from the API URL: *.convex.cloud → *.convex.site (HTTP actions endpoint)
  const apiUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (apiUrl)
    return apiUrl.replace(/\.convex\.cloud(\/.*)?$/, ".convex.site$1");
  return null;
}

async function getJoinPreview(
  token: string,
): Promise<JoinPreview | JoinError | null> {
  const base = resolveConvexHttpUrl();
  if (!base) {
    console.error("Neither CONVEX_HTTP_URL nor NEXT_PUBLIC_CONVEX_URL is set");
    return null;
  }
  const url = `${base.replace(/\/$/, "")}/join/${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data as JoinError).error ?? "Invalid link" };
    }
    return data as JoinPreview;
  } catch (e) {
    console.error("Join preview fetch failed:", e);
    return null;
  }
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token?.trim()) {
    notFound();
  }

  const preview = await getJoinPreview(token);
  if (!preview) {
    notFound();
  }
  if ("error" in preview) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Link inválido o vencido
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{preview.error}</p>
        </div>
      </div>
    );
  }

  const { name, logoUrl } = preview;
  const schemeUrl = `mat-app://join/${token}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-md w-full flex flex-col items-center text-center">
        {logoUrl ? (
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden mb-6 bg-zinc-200 dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-zinc-200 dark:bg-zinc-800 mb-6 flex items-center justify-center text-2xl font-bold text-zinc-500 dark:text-zinc-400">
            {name.charAt(0)}
          </div>
        )}
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Unite a {name}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Descargá la app para unirte a este gimnasio.
        </p>

        <div className="flex flex-col gap-3 w-full">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/appstore.svg"
              alt=""
              className="h-5 w-5 invert dark:invert-0"
              aria-hidden="true"
            />
            Descargar en App Store
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
            Descargar en Google Play
          </a>
        </div>

        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Si ya tenés la app instalada,{" "}
          <a
            href={schemeUrl}
            className="underline text-zinc-700 dark:text-zinc-300"
          >
            abrila desde acá
          </a>
          .
        </p>
      </div>
    </div>
  );
}
