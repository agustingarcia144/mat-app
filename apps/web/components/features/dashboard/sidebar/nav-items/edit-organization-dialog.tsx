'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useOrganization } from '@clerk/nextjs'
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
import { Label } from '@/components/ui/label'
import { isOrgAdminRole } from '@/lib/security/roles'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = {
  name: string
  logoUrl: string
  address: string
  phone: string
  email: string
}

const EMPTY_STATE: FormState = {
  name: '',
  logoUrl: '',
  address: '',
  phone: '',
  email: '',
}

export default function EditOrganizationDialog({ open, onOpenChange }: Props) {
  const { organization, membership, isLoaded } = useOrganization()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_STATE)

  const canEdit = useMemo(
    () => isOrgAdminRole(membership?.role),
    [membership?.role]
  )

  useEffect(() => {
    if (!open || !organization) return
    const metadata = (organization.publicMetadata ?? {}) as Record<
      string,
      unknown
    >
    setForm({
      name: organization.name ?? '',
      logoUrl: typeof metadata.logoUrl === 'string' ? metadata.logoUrl : '',
      address: typeof metadata.address === 'string' ? metadata.address : '',
      phone: typeof metadata.phone === 'string' ? metadata.phone : '',
      email: typeof metadata.email === 'string' ? metadata.email : '',
    })
  }, [open, organization])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) {
      toast.error('Solo administradores pueden editar la organización')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/secure/organization', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name,
          metadata: {
            logoUrl: form.logoUrl,
            address: form.address,
            phone: form.phone,
            email: form.email,
          },
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(body?.error || 'No se pudo actualizar la organización')
      }

      await organization?.reload()
      toast.success('Organización actualizada')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isLoaded) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar organización</DialogTitle>
          <DialogDescription>
            Solo puedes actualizar campos seguros. La eliminación y cambios de
            membresía están restringidos al backend administrativo.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="organization-name">Nombre</Label>
            <Input
              id="organization-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              disabled={!canEdit || isSubmitting}
              maxLength={80}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organization-logo-url">Logo URL (metadata)</Label>
            <Input
              id="organization-logo-url"
              value={form.logoUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  logoUrl: event.target.value,
                }))
              }
              disabled={!canEdit || isSubmitting}
              maxLength={500}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organization-address">Dirección</Label>
            <Input
              id="organization-address"
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
              disabled={!canEdit || isSubmitting}
              maxLength={200}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="organization-phone">Teléfono</Label>
              <Input
                id="organization-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                disabled={!canEdit || isSubmitting}
                maxLength={30}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organization-email">Email</Label>
              <Input
                id="organization-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                disabled={!canEdit || isSubmitting}
                maxLength={120}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!canEdit || isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
