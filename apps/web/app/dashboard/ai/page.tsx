import { Suspense } from "react";
import { MatiFullPage } from "@/components/features/ai/mati-full-page";

export default function AiPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center">Cargando Mati…</div>}>
      <MatiFullPage />
    </Suspense>
  );
}
