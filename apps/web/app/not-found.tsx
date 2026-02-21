import Image from 'next/image'
import Link from 'next/link'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="relative h-48 w-48 shrink-0">
        <Image
          src={matWolfLooking}
          alt=""
          width={192}
          height={192}
          className="h-full w-full object-contain"
          priority
        />
      </div>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Página no encontrada
        </h1>
        <p className="text-muted-foreground">
          Parece que esta ruta se ha perdido. Volvé al inicio para seguir.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Ir al inicio</Link>
      </Button>
    </main>
  )
}
