import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { isOrgAdminRole } from '@/lib/security/roles'

export default async function UsuariosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { orgRole } = await auth()
  if (!isOrgAdminRole(orgRole)) {
    redirect('/access-denied')
  }
  return <>{children}</>
}
