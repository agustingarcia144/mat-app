'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SignUp } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

export default function InviteOnlySignUp() {
  const searchParams = useSearchParams()
  const ticket = searchParams.get('__clerk_ticket')

  if (!ticket) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Acceso solo por invitación</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta plataforma se habilita únicamente para usuarios invitados por un
            administrador del gimnasio.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href="/sign-in">Iniciar sesión</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp forceRedirectUrl="/dashboard" signInUrl="/sign-in" />
    </div>
  )
}
