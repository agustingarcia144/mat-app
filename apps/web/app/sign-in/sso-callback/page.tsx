import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

export default function SignInSsoCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/dashboard" />
    </div>
  )
}
