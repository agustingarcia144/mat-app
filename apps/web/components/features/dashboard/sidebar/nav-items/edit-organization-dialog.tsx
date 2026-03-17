'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
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
import { api } from '@/convex/_generated/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = {
  name: string
  address: string
  phone: string
  email: string
}

const EMPTY_STATE: FormState = {
  name: '',
  address: '',
  phone: '',
  email: '',
}

export default function EditOrganizationDialog({ open, onOpenChange }: Props) {
  const router = useRouter()
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth()
  const currentOrganization = useQuery(api.organizations.getCurrentOrganization)
  const updateOrganization = useMutation(
    api.organizations.updateCurrentOrganization
  )
  const generateLogoUploadUrl = useMutation(
    api.organizations.generateOrganizationLogoUploadUrl
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_STATE)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_STATE)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const isLoaded = !isAuthLoading && currentOrganization !== undefined

  const canEdit = useMemo(
    () => isOrgAdminRole(currentOrganization?.role),
    [currentOrganization?.role]
  )

  useEffect(() => {
    if (!open || !currentOrganization) return
    setForm({
      name: currentOrganization.name ?? '',
      address: currentOrganization.address ?? '',
      phone: currentOrganization.phone ?? '',
      email: currentOrganization.email ?? '',
    })
    setInitialForm({
      name: currentOrganization.name ?? '',
      address: currentOrganization.address ?? '',
      phone: currentOrganization.phone ?? '',
      email: currentOrganization.email ?? '',
    })
    setLogoFile(null)
    setLogoPreviewUrl(null)
  }, [open, currentOrganization])

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return
    if (currentOrganization === null) {
      router.replace('/access-denied')
    }
  }, [currentOrganization, isAuthenticated, isAuthLoading, router])

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl)
      }
    }
  }, [logoPreviewUrl])

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl)
    }
    setLogoFile(selectedFile)
    setLogoPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null)
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) {
      toast.error('Solo administradores pueden editar la organización')
      return
    }

    setIsSubmitting(true)
    try {
      const hasFormChanges =
        form.name !== initialForm.name ||
        form.address !== initialForm.address ||
        form.phone !== initialForm.phone ||
        form.email !== initialForm.email ||
        logoFile !== null

      if (!hasFormChanges) {
        toast.info('No hay cambios para guardar')
        onOpenChange(false)
        return
      }

      let uploadedLogoStorageId: string | undefined
      if (logoFile) {
        const uploadUrl = await generateLogoUploadUrl({})
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': logoFile.type || 'application/octet-stream',
          },
          body: logoFile,
        })
        if (!uploadResponse.ok) {
          throw new Error('No se pudo subir el logo')
        }

        const uploadResult = (await uploadResponse.json()) as {
          storageId?: string
        }
        if (!uploadResult.storageId) {
          throw new Error('La subida no devolvio un storageId valido')
        }
        uploadedLogoStorageId = uploadResult.storageId
      }

      await updateOrganization({
        name: form.name,
        metadata: {
          address: form.address,
          phone: form.phone,
          email: form.email,
          ...(uploadedLogoStorageId
            ? { logoStorageId: uploadedLogoStorageId as never }
            : {}),
        },
      })
      router.refresh()
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
            Modifica la información de la organización.
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
            <Label htmlFor="organization-logo">Logo</Label>
            {(logoPreviewUrl || currentOrganization?.logoUrl) && (
              <div className="h-16 w-16 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreviewUrl ?? currentOrganization?.logoUrl ?? ''}
                  alt="Logo de la organizacion"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <Input
              id="organization-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleLogoFileChange}
              disabled={!canEdit || isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Sube una nueva imagen para reemplazar el logo actual.
            </p>
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
