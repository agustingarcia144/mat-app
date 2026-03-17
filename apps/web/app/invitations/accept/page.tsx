'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useAction } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ValidationReason = 'invalid' | 'expired' | 'revoked' | 'accepted' | null

function getValidationMessage(reason: ValidationReason) {
  if (reason === 'expired') return 'Esta invitacion expiro. Solicita una nueva invitacion.'
  if (reason === 'revoked') return 'Esta invitacion fue revocada.'
  if (reason === 'accepted') return 'Esta invitacion ya fue aceptada.'
  return 'Esta invitacion no es valida.'
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, userId } = useAuth()
  const token = searchParams.get('token')?.trim() ?? ''
  const validateInvitationToken = useAction(api.organizations.validateInvitationToken)
  const acceptInvitationByToken = useAction(api.organizations.acceptInvitationByToken)

  const [isValidating, setIsValidating] = React.useState(false)
  const [validationReason, setValidationReason] = React.useState<ValidationReason>(null)
  const [invitation, setInvitation] = React.useState<{
    roleLabel: string
    organizationName: string
    email: string
  } | null>(null)
  const [isAccepting, setIsAccepting] = React.useState(false)

  React.useEffect(() => {
    if (!token) {
      setValidationReason('invalid')
      setInvitation(null)
      return
    }

    let cancelled = false
    setIsValidating(true)
    setValidationReason(null)
    void validateInvitationToken({ token })
      .then((result) => {
        if (cancelled) return
        if (!result.valid) {
          setValidationReason(result.reason)
          setInvitation(null)
          return
        }
        setValidationReason(null)
        setInvitation(result.invitation)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setValidationReason('invalid')
        setInvitation(null)
        toast.error(
          error instanceof Error ? error.message : 'No se pudo validar la invitacion.'
        )
      })
      .finally(() => {
        if (!cancelled) setIsValidating(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, validateInvitationToken])

  const redirectUrl = React.useMemo(
    () => `/invitations/accept?token=${encodeURIComponent(token)}`,
    [token]
  )

  const handleAccept = async () => {
    if (!token) return
    setIsAccepting(true)
    try {
      await acceptInvitationByToken({ token })
      toast.success('Invitacion aceptada correctamente.')
      router.push('/select-organization')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo aceptar la invitacion.'
      )
    } finally {
      setIsAccepting(false)
    }
  }

  return (
    <main className="container mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Aceptar invitacion</CardTitle>
          <CardDescription>
            Confirma tu acceso como miembro del equipo en la organizacion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isValidating ? (
            <p className="text-sm text-muted-foreground">Validando invitacion...</p>
          ) : null}

          {!isValidating && validationReason ? (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm text-destructive">{getValidationMessage(validationReason)}</p>
              <Button asChild variant="outline">
                <Link href="/">Volver al inicio</Link>
              </Button>
            </div>
          ) : null}

          {!isValidating && !validationReason && invitation ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm">
                Fuiste invitado a <strong>{invitation.organizationName}</strong> como{' '}
                <strong>{invitation.roleLabel}</strong> para el email{' '}
                <strong>{invitation.email}</strong>.
              </p>

              {isLoaded && !userId ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}>
                      Iniciar sesion
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link
                      href={`/sign-up?invite_token=${encodeURIComponent(token)}&redirect_url=${encodeURIComponent(redirectUrl)}`}
                    >
                      Crear cuenta
                    </Link>
                  </Button>
                </div>
              ) : null}

              {isLoaded && userId ? (
                <Button onClick={() => void handleAccept()} disabled={isAccepting}>
                  {isAccepting ? 'Aceptando...' : 'Aceptar invitacion'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

export default function AcceptInvitationPage() {
  return (
    <React.Suspense
      fallback={
        <main className="container mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4 py-10">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Aceptar invitacion</CardTitle>
              <CardDescription>Cargando invitacion...</CardDescription>
            </CardHeader>
          </Card>
        </main>
      }
    >
      <AcceptInvitationContent />
    </React.Suspense>
  )
}
