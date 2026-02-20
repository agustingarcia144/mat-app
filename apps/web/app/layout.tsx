import '../styles/global.css'
import Providers from '@/components/providers/providers'

export const metadata = {
  manifest: '/manifest.json',
  themeColor: '#000000',
  // iOS: home screen icon (Safari uses this when “Add to Home Screen”)
  icons: {
    apple: [
      { url: '/icons/ios/180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/ios/152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/ios/167.png', sizes: '167x167', type: 'image/png' },
    ],
  },
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
