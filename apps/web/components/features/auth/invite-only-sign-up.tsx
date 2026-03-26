'use client';
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SignUp, useClerk, useUser } from "@clerk/nextjs";
import { useSignIn } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const STAFF_REDIRECT = '/select-organization'

function getSafeRedirectUrl(value: string | null, fallback: string) {
  if (!value) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('/')) return decoded
  } catch {
    // Ignore malformed redirect values.
  }
  return fallback
}

function InvitationStatusCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent className="flex gap-2">{children}</CardContent> : null}
      </Card>
    </div>
  )
}

export default function InviteOnlySignUp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signOut } = useClerk()
  const { isLoaded, signIn, setActive } = useSignIn()
  const { isSignedIn } = useUser()
  const ticket = searchParams.get('__clerk_ticket')
  const accountStatus = searchParams.get('__clerk_status')
  const inviteToken = searchParams.get('invite_token')
  const redirectUrl = searchParams.get('redirect_url')
  const fallbackRedirect = inviteToken
    ? `/invitations/accept?token=${encodeURIComponent(inviteToken)}`
    : STAFF_REDIRECT
  const postSignUpRedirect = getSafeRedirectUrl(redirectUrl, fallbackRedirect)
  const attemptedRef = useRef(false)
  const [retryKey, setRetryKey] = useState(0)
  const [signInError, setSignInError] = useState<string | null>(null)

  useEffect(() => {
    if (isSignedIn && !ticket) {
      router.replace(postSignUpRedirect)
    }
  }, [isSignedIn, postSignUpRedirect, router, ticket])

  useEffect(() => {
    if (
      !ticket ||
      accountStatus !== 'sign_in' ||
      !isLoaded ||
      !signIn ||
      attemptedRef.current
    ) {
      return
    }

    attemptedRef.current = true

    void signIn
      .create({
        strategy: 'ticket',
        ticket,
      })
      .then(async (attempt) => {
        if (attempt.status !== 'complete') {
          throw new Error('No se pudo completar el acceso con la invitación.')
        }

        await setActive({
          session: attempt.createdSessionId,
          navigate: () => router.replace(STAFF_REDIRECT),
        })
      })
      .catch(async (error: unknown) => {
        const message =
          error && typeof error === 'object' && 'errors' in error
            ? (error as { errors?: Array<{ longMessage?: string }> }).errors?.[0]
                ?.longMessage
            : null

        if (message && /already signed in/i.test(message)) {
          attemptedRef.current = false
          await signOut()
          setRetryKey((current) => current + 1)
          return
        }

        setSignInError(
          message ??
            'No se pudo completar el ingreso con esta invitación. Vuelve a intentarlo.'
        )
      })
  }, [accountStatus, isLoaded, retryKey, router, setActive, signIn, signOut, ticket])

  if (!ticket && !inviteToken) {
    return (
      <InvitationStatusCard
        title="Acceso solo por invitación"
        description="Esta plataforma se habilita únicamente para usuarios invitados por un administrador del gimnasio."
      >
        <Button asChild>
          <Link href="/sign-in">Iniciar sesión</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </InvitationStatusCard>
    )
  }

  if (accountStatus === 'sign_in') {
    if (signInError) {
      return (
        <InvitationStatusCard
          title="No se pudo aceptar la invitación"
          description={signInError}
        >
          <Button
            type="button"
            onClick={() => {
              attemptedRef.current = false
              setSignInError(null)
              setRetryKey((current) => current + 1)
            }}
          >
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </InvitationStatusCard>
      )
    }

    return (
      <InvitationStatusCard
        title="Conectando tu invitación"
        description="Estamos validando tu acceso para entrar a la organización."
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Ingresando…
        </div>
      </InvitationStatusCard>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" />
      <SignUp forceRedirectUrl={postSignUpRedirect} signInUrl="/sign-in" />
    </div>
  )
}
