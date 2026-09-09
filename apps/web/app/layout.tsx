import "../styles/global.css";
import Providers from "@/components/providers/providers";

export const metadata = {
  title: {
    default: "Mat - Control y Orden para tu Gimnasio",
    template: "%s | Mat",
  },
  description:
    "Planificá clases, seguí el progreso de tus alumnos y llevá tu gimnasio al siguiente nivel.",
  manifest: "/manifest.json",
  // El traductor de Chrome reemplaza los nodos de texto por sus propios <font>,
  // y al desmontar React 19 ya no encuentra el nodo original:
  // "NotFoundError: Failed to execute removeChild on Node". La app es solo en
  // español, así que desactivamos la traducción en vez de parchear el DOM.
  other: { google: "notranslate" },
  // iOS: home screen icon (Safari uses this when “Add to Home Screen”)
  icons: {
    apple: [
      { url: "/icons/ios/180.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/ios/152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/ios/167.png", sizes: "167x167", type: "image/png" },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" translate="no" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
