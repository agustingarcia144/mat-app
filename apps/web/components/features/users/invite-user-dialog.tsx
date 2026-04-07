'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  getStaffInviteRoleLabel,
  INVITABLE_STAFF_ROLES,
  type StaffInviteRole,
  type StaffInvitation,
} from '@/lib/security/organization-invitations'
import { api } from '@/convex/_generated/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: (invitation: StaffInvitation) => void
}

type FormErrors = {
  email?: string
  role?: string
}

const INITIAL_ROLE: StaffInviteRole = 'trainer'

export function InviteUserDialog({ open, onOpenChange, onInvited }: Props) {
  const createInvitation = useMutation(api.organizations.createInvitation)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffInviteRole>(INITIAL_ROLE)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setEmail('')
      setRole(INITIAL_ROLE)
      setErrors({})
      setIsSubmitting(false)
    }
  }, [open])

  const validate = () => {
    const nextErrors: FormErrors = {}
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      nextErrors.email = 'Ingresa un email para enviar la invitación.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = 'Ingresa un email válido.'
    }

    if (!INVITABLE_STAFF_ROLES.includes(role)) {
      nextErrors.role = 'Selecciona un rol válido.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) {
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createInvitation({
        email: email.trim().toLowerCase(),
        role,
      })
      const invitation = result?.invitation as StaffInvitation | undefined
      if (!invitation) {
        throw new Error('No se pudo enviar la invitación')
      }
      toast.success('Invitación enviada')
      onInvited(invitation)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Envía una invitación por email para que un administrador o entrenador
            pueda acceder al dashboard de esta organización.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="invite-user-email">Email</FieldLabel>
            <Input
              id="invite-user-email"
              type="email"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              required
            />
            <FieldDescription>
              Si la persona ya tiene cuenta, podrá iniciar sesión. Si no, podrá
              crearla y luego aceptar la invitación.
            </FieldDescription>
            <FieldError>{errors.email}</FieldError>
          </Field>

          <Field>
            <FieldLabel>Rol</FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value as StaffInviteRole)
                setErrors((current) => ({ ...current, role: undefined }))
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_STAFF_ROLES.map((inviteRole) => (
                  <SelectItem key={inviteRole} value={inviteRole}>
                    {getStaffInviteRoleLabel(inviteRole)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              La invitación dará acceso como {getStaffInviteRoleLabel(role)}.
            </FieldDescription>
            <FieldError>{errors.role}</FieldError>
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
