import '../styles/global.css'
import Providers from '@/components/providers/providers'

export const metadata = {
  title: {
    default: 'Mat - Control y Orden para tu Gimnasio',
    template: '%s | Mat',
  },
  description: 'Planificá clases, seguí el progreso de tus alumnos y llevá tu gimnasio al siguiente nivel.',
  manifest: '/manifest.json',
  // iOS: home screen icon (Safari uses this when “Add to Home Screen”)
  icons: {
    apple: [
      { url: '/icons/ios/180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/ios/152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/ios/167.png', sizes: '167x167', type: 'image/png' },
    ],
  },
}

export const viewport = {
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
      <html lang="en" suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
  )
}
