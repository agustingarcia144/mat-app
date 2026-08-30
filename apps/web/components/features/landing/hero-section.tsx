'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CreditCard,
  Dumbbell,
  Loader2,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react'
import {
  Authenticated,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery
} from 'convex/react'
import { useClerk, useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/features/landing/logo'
import { SignInDialog } from '@/components/features/auth/sign-in-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { motion } from 'motion/react'
import appMockup from '@/assets/app-mockup.png'
import screenshotWeb from '@/assets/screenshot_web.png'
import wolf from '@/assets/mat-wolf.png'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

type OrgCheckoutDetails = {
  organizationName: string
  organizationAddress?: string
  organizationPhone?: string
  organizationEmail?: string
  adminPhone?: string
}

type DialogMode = 'trial' | 'lite' | 'ultra'
type CheckoutPlan = Exclude<DialogMode, 'trial'>

const PENDING_LITE_CHECKOUT_KEY = 'mat.pendingLiteCheckout'
const PENDING_ULTRA_CHECKOUT_KEY = 'mat.pendingUltraCheckout'
const PENDING_PRO_TRIAL_KEY = 'mat.pendingProTrial'

// Each paid plan parks the form in session storage under its own key and
// resumes from its own query param, so signing up mid-checkout cannot land the
// gym on the other plan.
const CHECKOUT_PLANS: Record<
  CheckoutPlan,
  { pendingKey: string; resumeParam: string; label: string }
> = {
  lite: {
    pendingKey: PENDING_LITE_CHECKOUT_KEY,
    resumeParam: 'lite_checkout',
    label: 'Lite'
  },
  ultra: {
    pendingKey: PENDING_ULTRA_CHECKOUT_KEY,
    resumeParam: 'ultra_checkout',
    label: 'Ultra'
  }
}
const mercadoPagoCheckoutEnabled =
  process.env.NEXT_PUBLIC_MERCADOPAGO_CHECKOUT_ENABLED === 'true'

const ACCENT = '#FF5C24'

const arsCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
})

function readPending(key: string): OrgCheckoutDetails | null {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.sessionStorage.getItem(key)
    if (!rawValue) return null
    const parsed = JSON.parse(rawValue) as Partial<OrgCheckoutDetails>
    if (!parsed.organizationName?.trim()) return null

    return {
      organizationName: parsed.organizationName.trim(),
      organizationAddress: parsed.organizationAddress?.trim() || undefined,
      organizationPhone: parsed.organizationPhone?.trim() || undefined,
      organizationEmail: parsed.organizationEmail?.trim() || undefined,
      adminPhone: parsed.adminPhone?.trim() || undefined
    }
  } catch {
    return null
  }
}

function writePending(key: string, value: OrgCheckoutDetails) {
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function clearPending(key: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(key)
}

const productHighlights = [
  {
    icon: CalendarDays,
    title: 'Clases y agenda',
    description:
      'Organizá horarios, cupos y reservas para que todo el staff trabaje con una sola agenda.'
  },
  {
    icon: Dumbbell,
    title: 'Planificaciones',
    description:
      'Creá rutinas, semanas de trabajo y ejercicios con una estructura clara y fácil de seguir.'
  },
  {
    icon: Users,
    title: 'Socios y equipo',
    description:
      'Centralizá miembros, invitaciones y seguimiento del gimnasio sin planillas sueltas.'
  },
  {
    icon: CreditCard,
    title: 'Pagos y planes',
    description:
      'Gestioná membresías, estados de pago, comprobantes y revisiones desde un solo lugar.'
  },
  {
    icon: BarChart3,
    title: 'Métricas',
    description:
      'Mirá ingresos, uso del sistema y datos clave para decidir con más contexto.'
  },
  {
    icon: ShieldCheck,
    title: 'Orden operativo',
    description:
      'Roles, permisos y procesos simples para que la gestión diaria no dependa de la memoria.'
  }
]

const heroStats = [
  { value: 'Web + móvil', label: 'una sola operación' },
  { value: '7 días', label: 'de Pro, sin tarjeta' },
  { value: 'Setup rápido', label: 'empezás hoy mismo' }
]

const proFeatures = [
  'Clases, agenda y cupos',
  'Planificaciones y ejercicios',
  'Socios, equipo y roles',
  'Pagos, finanzas y métricas',
  'App móvil para tus socios',
  'Configuración personalizada'
]

const liteFeatures = [
  'Socios y miembros',
  'Ejercicios',
  'Planificaciones',
  'Dashboard Lite'
]

const ultraFeatures = [
  'Todo lo de Pro',
  'Sin comisión MAT en los cobros a socios',
  'Recompensas y puntos por asistencia',
  'Ingreso QR en recepción',
  'Mati AI con 100 consultas por mes'
]

const orangeButtonClassName =
  'rounded-full border border-transparent bg-[#FF5C24] px-5 text-white transition-colors hover:bg-[#F04E0E] shadow-[0_12px_34px_-10px_rgba(255,92,36,0.7)]'

const subtleButtonClassName =
  'rounded-full border border-white/14 bg-white/[0.04] px-5 text-white transition-colors hover:bg-white/[0.09] hover:text-white'

const compactSubtleButtonClassName =
  'rounded-full border border-white/14 bg-white/[0.04] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.09] hover:text-white'

const navLinkClassName =
  'font-medium text-white/64 transition-colors hover:text-white'

const revealVariants = {
  hidden: { opacity: 0, filter: 'blur(10px)', y: 18 },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: { duration: 0.8 }
  }
}

function Reveal({
  children,
  className,
  amount = 0.2,
  once = false
}: {
  children: React.ReactNode
  className?: string
  amount?: number
  once?: boolean
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={revealVariants}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function RevealGroup({
  children,
  className,
  amount = 0.18,
  stagger = 0.08,
  once = false
}: {
  children: React.ReactNode
  className?: string
  amount?: number
  stagger?: number
  once?: boolean
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: stagger, delayChildren: 0.04 }
        }
      }}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={revealVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/50">
      <span className="size-1.5 rounded-full bg-[#FF5C24]" />
      {children}
    </span>
  )
}

function trackWhatsAppClick(source: string) {
  window.fbq?.('trackCustom', 'WhatsAppContactClick', {
    source,
    channel: 'whatsapp'
  })
}

function WhatsAppFloatingButton() {
  const whatsappHref =
    'https://wa.me/5491152216540?text=Hola%2C%20quiero%20conocer%20MAT'

  return (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noreferrer"
      aria-label="Contactar por WhatsApp"
      onClick={() => trackWhatsAppClick('floating_button')}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-3 rounded-full border border-white/12 bg-[#121214]/90 px-3 py-3 text-sm font-medium text-white shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 sm:bottom-5 sm:right-5 sm:px-4"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-[#FF5C24] text-white">
        <MessageCircle className="size-5" />
      </span>
      <span className="hidden sm:block">Hablar con nosotros</span>
    </a>
  )
}

export default function HeroSection() {
  const router = useRouter()
  const { signOut } = useClerk()
  const { isLoaded: isUserLoaded, isSignedIn, user } = useUser()
  const createLiteOrganization = useMutation(
    api.organizations.createLiteOrganization
  )
  const createCheckout = useAction(api.organizationBilling.createCheckout)
  const proPlan = useQuery(api.appBillingPlans.getPro)
  const litePlan = useQuery(api.appBillingPlans.getLite)
  const ultraPlan = useQuery(api.appBillingPlans.getUltra)
  const proPriceLabel =
    typeof proPlan?.priceArs === 'number'
      ? arsCurrency.format(proPlan.priceArs)
      : null
  const litePriceLabel =
    typeof litePlan?.priceArs === 'number'
      ? arsCurrency.format(litePlan.priceArs)
      : null
  const ultraPriceLabel =
    typeof ultraPlan?.priceArs === 'number'
      ? arsCurrency.format(ultraPlan.priceArs)
      : null
  const [isScrolled, setIsScrolled] = React.useState(false)
  const [signInOpen, setSignInOpen] = React.useState(false)
  const [dialogMode, setDialogMode] = React.useState<DialogMode | null>(null)
  const [organizationName, setOrganizationName] = React.useState('')
  const [organizationAddress, setOrganizationAddress] = React.useState('')
  const [organizationPhone, setOrganizationPhone] = React.useState('')
  const [organizationEmail, setOrganizationEmail] = React.useState('')
  const [adminPhone, setAdminPhone] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const autoStartedCheckoutRef = React.useRef(false)
  const autoStartedTrialRef = React.useRef(false)
  const whatsappHref =
    'https://wa.me/5491152216540?text=Hola%2C%20quiero%20conocer%20MAT'

  React.useEffect(() => {
    const primaryEmail = user?.primaryEmailAddress?.emailAddress
    if (primaryEmail && !organizationEmail) {
      setOrganizationEmail(primaryEmail)
    }
  }, [organizationEmail, user?.primaryEmailAddress?.emailAddress])

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    handleScroll()
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const buildDetails = React.useCallback(
    (): OrgCheckoutDetails => ({
      organizationName: organizationName.trim(),
      organizationAddress: organizationAddress.trim() || undefined,
      organizationPhone: organizationPhone.trim() || undefined,
      organizationEmail: organizationEmail.trim() || undefined,
      adminPhone: adminPhone.trim() || undefined
    }),
    [
      adminPhone,
      organizationAddress,
      organizationEmail,
      organizationName,
      organizationPhone
    ]
  )

  const applyDetails = React.useCallback((details: OrgCheckoutDetails) => {
    setOrganizationName(details.organizationName)
    setOrganizationAddress(details.organizationAddress ?? '')
    setOrganizationPhone(details.organizationPhone ?? '')
    setOrganizationEmail(details.organizationEmail ?? '')
    setAdminPhone(details.adminPhone ?? '')
  }, [])

  const createOrganization = React.useCallback(
    (details: OrgCheckoutDetails) =>
      createLiteOrganization({
        name: details.organizationName.trim(),
        address: details.organizationAddress,
        phone: details.organizationPhone,
        email: details.organizationEmail,
        adminPhone: details.adminPhone,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }),
    [createLiteOrganization]
  )

  const startProTrial = React.useCallback(
    async (details: OrgCheckoutDetails) => {
      if (!details.organizationName.trim()) {
        toast.error('Completá el nombre de la organización')
        return
      }

      setIsSubmitting(true)
      try {
        await createOrganization(details)
        clearPending(PENDING_PRO_TRIAL_KEY)
        toast.success('¡Listo! Tu prueba Pro de 7 días está activa.')
        router.push('/dashboard')
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar la prueba Pro'
        )
        setIsSubmitting(false)
      }
    },
    [createOrganization, router]
  )

  const startPlanCheckout = React.useCallback(
    async (plan: CheckoutPlan, details: OrgCheckoutDetails) => {
      if (!mercadoPagoCheckoutEnabled) {
        toast.error('El checkout de Mercado Pago no está disponible')
        return
      }
      if (!details.organizationName.trim()) {
        toast.error('Completá el nombre de la organización')
        return
      }

      setIsSubmitting(true)
      try {
        await createOrganization(details)
        clearPending(CHECKOUT_PLANS[plan].pendingKey)
        const result = await createCheckout({ planKey: plan })
        window.location.href = result.initPoint
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `No se pudo iniciar la suscripción ${CHECKOUT_PLANS[plan].label}`
        )
        setIsSubmitting(false)
      }
    },
    [createCheckout, createOrganization]
  )

  // Resume a paid checkout started before signing in.
  React.useEffect(() => {
    if (
      autoStartedCheckoutRef.current ||
      !isUserLoaded ||
      !isSignedIn ||
      typeof window === 'undefined' ||
      !mercadoPagoCheckoutEnabled
    ) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const plan = (Object.keys(CHECKOUT_PLANS) as CheckoutPlan[]).find(
      (candidate) => params.get(CHECKOUT_PLANS[candidate].resumeParam) === '1'
    )
    if (!plan) return

    const pending = readPending(CHECKOUT_PLANS[plan].pendingKey)
    if (!pending) {
      setDialogMode(plan)
      return
    }

    autoStartedCheckoutRef.current = true
    applyDetails(pending)
    void startPlanCheckout(plan, pending)
  }, [applyDetails, isSignedIn, isUserLoaded, startPlanCheckout])

  // Resume a Pro trial started before signing in.
  React.useEffect(() => {
    if (
      autoStartedTrialRef.current ||
      !isUserLoaded ||
      !isSignedIn ||
      typeof window === 'undefined'
    ) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('start_trial') !== '1') return

    const pending = readPending(PENDING_PRO_TRIAL_KEY)
    if (!pending) {
      setDialogMode('trial')
      return
    }

    autoStartedTrialRef.current = true
    applyDetails(pending)
    void startProTrial(pending)
  }, [applyDetails, isSignedIn, isUserLoaded, startProTrial])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const details = buildDetails()
    if (!details.organizationName) {
      toast.error('Completá el nombre de la organización')
      return
    }
    if (!isUserLoaded) return

    if (dialogMode === null) return

    const isTrial = dialogMode === 'trial'
    const pendingKey = isTrial
      ? PENDING_PRO_TRIAL_KEY
      : CHECKOUT_PLANS[dialogMode].pendingKey
    const resumeParam = isTrial
      ? 'start_trial=1'
      : `${CHECKOUT_PLANS[dialogMode].resumeParam}=1`

    if (!isSignedIn) {
      writePending(pendingKey, details)
      router.push(
        `/sign-up?${resumeParam}&redirect_url=${encodeURIComponent(
          `/?${resumeParam}`
        )}`
      )
      return
    }

    if (isTrial) {
      await startProTrial(details)
    } else {
      await startPlanCheckout(dialogMode, details)
    }
  }

  const storeDetailsForSignIn = () => {
    const details = buildDetails()
    if (!details.organizationName) return
    if (dialogMode === null) return
    writePending(
      dialogMode === 'trial'
        ? PENDING_PRO_TRIAL_KEY
        : CHECKOUT_PLANS[dialogMode].pendingKey,
      details
    )
  }

  const isTrialDialog = dialogMode === 'trial'

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#08080A] text-white antialiased">
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1304928111588479');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src="https://www.facebook.com/tr?id=1304928111588479&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_42%_at_50%_-8%,rgba(255,92,36,0.16),transparent_60%),radial-gradient(40%_30%_at_85%_8%,rgba(255,92,36,0.07),transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(70% 60% at 50% 0%, black, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(70% 60% at 50% 0%, black, transparent 75%)'
        }}
      />

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
      >
        <DialogContent className="border-white/10 bg-[#0E0E11] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {isTrialDialog
                ? 'Empezá tu prueba Pro de 7 días'
                : `Activar MAT ${dialogMode ? CHECKOUT_PLANS[dialogMode].label : ''}`}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {isTrialDialog
                ? 'Creá tu organización y entrá al panel completo. Tenés 7 días de Pro, sin tarjeta.'
                : 'Creá la organización, registrá tu usuario administrador y continuá el pago recurrente en Mercado Pago.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="organization-name">
                Nombre de la organización
              </Label>
              <Input
                id="organization-name"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization-address">Dirección</Label>
              <Input
                id="organization-address"
                value={organizationAddress}
                onChange={(event) => setOrganizationAddress(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization-phone">
                  Teléfono del gimnasio
                </Label>
                <Input
                  id="organization-phone"
                  value={organizationPhone}
                  onChange={(event) => setOrganizationPhone(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-email">Email del gimnasio</Label>
                <Input
                  id="organization-email"
                  type="email"
                  value={organizationEmail}
                  onChange={(event) => setOrganizationEmail(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-phone">Tu teléfono</Label>
              <Input
                id="admin-phone"
                value={adminPhone}
                onChange={(event) => setAdminPhone(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className={orangeButtonClassName}
                disabled={isSubmitting || !isUserLoaded}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {isTrialDialog ? 'Creando…' : 'Preparando pago…'}
                  </>
                ) : isSignedIn ? (
                  isTrialDialog ? (
                    'Activar prueba Pro'
                  ) : (
                    'Crear organización y pagar'
                  )
                ) : (
                  'Continuar con registro'
                )}
              </Button>
              {!isSignedIn ? (
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-white/14 bg-transparent text-white hover:bg-white/[0.06] hover:text-white"
                >
                  <Link
                    href={`/sign-in?redirect_url=${encodeURIComponent(
                      isTrialDialog ? '/?start_trial=1' : '/?lite_checkout=1'
                    )}`}
                    onClick={storeDetailsForSignIn}
                  >
                    Ya tengo cuenta
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <WhatsAppFloatingButton />

      {/* ===== Navbar (style preserved, dark-only) ===== */}
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-5">
        <Reveal amount={0} once>
          <div
            className={`mx-auto rounded-[1.6rem] border border-white/10 bg-[#0B0B0D]/72 px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 ${
              isScrolled ? 'max-w-5xl px-3 py-2.5 sm:px-4' : 'max-w-7xl'
            }`}
          >
            <div className="relative flex items-center justify-between gap-3">
              <Link
                href="/"
                aria-label="Ir al inicio"
                className={`shrink-0 rounded-full px-3 transition-all duration-300 ${
                  isScrolled ? 'py-1.5' : 'py-2'
                }`}
              >
                <Logo className="h-7 w-auto" />
              </Link>

              <nav
                className={`absolute left-1/2 hidden -translate-x-1/2 items-center rounded-full border border-white/10 bg-white/[0.04] shadow-sm transition-all duration-300 md:flex ${
                  isScrolled ? 'gap-1 px-2.5 py-1.5' : 'gap-2 px-3 py-2'
                }`}
              >
                {[
                  { href: '#funciones', label: 'Funciones' },
                  { href: '#producto', label: 'Producto' },
                  { href: '#precio', label: 'Precio' },
                  { href: '#contacto', label: 'Contacto' }
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`${navLinkClassName} transition-all duration-300 ${
                      isScrolled ? 'px-2 text-xs' : 'px-3 text-sm'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="flex items-center gap-2 sm:gap-3">
                <Unauthenticated>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSignInOpen(true)}
                    className={`${compactSubtleButtonClassName} px-3 text-xs sm:px-4 ${
                      isScrolled ? 'text-xs' : 'sm:text-sm'
                    }`}
                  >
                    <span className="sm:hidden">Ingresar</span>
                    <span className="hidden sm:inline">Iniciar sesión</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setDialogMode('trial')}
                    className={`${orangeButtonClassName} px-3 py-2 text-xs sm:px-4 sm:text-sm`}
                  >
                    Empezar gratis
                  </Button>
                  <SignInDialog
                    open={signInOpen}
                    onOpenChange={setSignInOpen}
                  />
                </Unauthenticated>

                <Authenticated>
                  <Button
                    asChild
                    className={`md:hidden ${compactSubtleButtonClassName}`}
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>

                  <Button
                    asChild
                    className={`hidden md:inline-flex ${compactSubtleButtonClassName} ${
                      isScrolled ? 'text-xs' : ''
                    }`}
                  >
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Abrir menú de cuenta"
                        className="hidden size-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.09] md:flex"
                      >
                        {user?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.imageUrl}
                            alt="Perfil"
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center bg-white/10 text-[11px] font-semibold text-white">
                            {user?.fullName?.charAt(0).toUpperCase() ||
                              user?.emailAddresses?.[0]?.emailAddress
                                ?.charAt(0)
                                .toUpperCase() ||
                              'U'}
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => signOut({ redirectUrl: '/' })}
                      >
                        <LogOut className="mr-2 size-4" />
                        Cerrar sesión
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Authenticated>
              </div>
            </div>
          </div>
        </Reveal>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-28 text-center sm:px-6 sm:pt-36 lg:pt-40">
          <Reveal amount={0} once>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs text-white/70 backdrop-blur-xl sm:text-sm">
              <Sparkles className="size-4 text-[#FF5C24]" />
              <span>
                Gestión clara para gimnasios y centros de entrenamiento
              </span>
            </div>
          </Reveal>

          <Reveal amount={0.35} className="mt-6">
            <h1 className="mx-auto max-w-4xl text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.04em] sm:text-6xl lg:text-[4.25rem]">
              Control, orden y seguimiento
              <br className="hidden sm:block" /> real para tu{' '}
              <span className="text-[#FF5C24]">gimnasio</span>.
            </h1>
          </Reveal>

          <Reveal amount={0.2} className="mt-6">
            <p className="mx-auto max-w-2xl text-pretty text-base leading-7 text-white/64 sm:text-lg">
              Clases, planificaciones, socios y pagos en una sola plataforma —
              con web para el staff y app móvil para el día a día.
            </p>
          </Reveal>

          <RevealGroup
            className="mt-9 flex flex-col items-center gap-3"
            amount={0.1}
            once
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => setDialogMode('trial')}
                className={orangeButtonClassName}
              >
                Empezá gratis 7 días
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <Button asChild size="lg" className={subtleButtonClassName}>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackWhatsAppClick('hero_secondary')}
                >
                  Ver una demo
                  <MessageCircle className="ml-2 size-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-white/45">
              Sin tarjeta de crédito · 7 días de Pro completo
            </p>
          </RevealGroup>
        </div>

        {/* Hero product visual */}
        <Reveal
          amount={0.1}
          className="relative mx-auto max-w-6xl px-4 sm:px-6"
        >
          <div className="pointer-events-none absolute inset-x-8 -top-6 bottom-10 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,92,36,0.22),transparent_70%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0C0C0E] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:rounded-[1.75rem]">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <div className="ml-3 hidden h-6 flex-1 items-center rounded-md bg-white/[0.04] px-3 text-xs text-white/35 sm:flex">
                matgestion.app/dashboard
              </div>
            </div>
            <Image
              src={screenshotWeb}
              alt="Panel web de MAT con planificaciones y gestión del gimnasio"
              priority
              sizes="(max-width: 768px) 100vw, 1152px"
              className="h-auto w-full"
            />
          </div>
        </Reveal>
      </section>

      {/* ===== Stats strip ===== */}
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <RevealGroup className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:grid-cols-3">
          {heroStats.map((stat) => (
            <div key={stat.value} className="bg-[#0A0A0C] p-6 text-center">
              <p className="text-2xl font-semibold tracking-[-0.03em] text-white">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-white/55">{stat.label}</p>
            </div>
          ))}
        </RevealGroup>
      </div>

      {/* ===== Features ===== */}
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <section id="funciones" className="scroll-mt-28 sm:scroll-mt-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Funcionalidades</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Todo el gimnasio, conectado en un solo lugar.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60">
              Funciones reales de MAT, pensadas para que el valor se entienda
              rápido y sin ruido visual.
            </p>
          </Reveal>

          <RevealGroup className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {productHighlights.map((item) => {
              const Icon = item.icon
              return (
                <article
                  key={item.title}
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#FF5C24] transition-colors group-hover:border-[#FF5C24]/40">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {item.description}
                  </p>
                </article>
              )
            })}
          </RevealGroup>
        </section>
      </div>

      {/* ===== Product showcase ===== */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <section id="producto" className="scroll-mt-28 sm:scroll-mt-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Producto</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Una experiencia para el staff y otra para tus socios.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
            {/* Web panel */}
            <Reveal className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0C0C0E] p-6 sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/45">
                Vista web
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Panel para administrar todo el gimnasio
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                Planificaciones, miembros, clases y pagos con una navegación
                clara para que el equipo trabaje ordenado.
              </p>
              <div className="relative mt-6">
                <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-[radial-gradient(50%_50%_at_50%_30%,rgba(255,92,36,0.12),transparent_70%)] blur-xl" />
                <div className="overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]">
                  <Image
                    src={screenshotWeb}
                    alt="Vista web de MAT con dashboard de planificaciones"
                    sizes="(max-width: 1024px) 100vw, 700px"
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </Reveal>

            {/* Mobile panel */}
            <Reveal className="relative flex flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0C0C0E] p-6 sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/45">
                App móvil
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Seguimiento simple desde el celular
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Tus socios ven sus clases y rutinas del día en una app rápida y
                clara.
              </p>
              <div className="relative mt-6 flex flex-1 items-end justify-center">
                <div className="pointer-events-none absolute inset-x-6 bottom-0 top-4 -z-10 rounded-[2rem] bg-[radial-gradient(50%_60%_at_50%_100%,rgba(255,92,36,0.14),transparent_70%)] blur-xl" />
                <Image
                  src={appMockup}
                  alt="App móvil de MAT mostrando la rutina del día"
                  sizes="(max-width: 1024px) 60vw, 280px"
                  className="h-auto w-[200px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)] sm:w-[230px]"
                />
              </div>
            </Reveal>
          </div>

          {/* Before / After */}
          <Reveal className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-6 sm:p-8">
              <p className="text-sm font-medium text-white/45">Antes de MAT</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/55">
                {[
                  'Horarios repartidos en chats y notas.',
                  'Pagos sin seguimiento centralizado.',
                  'Rutinas y clases sin una vista clara.'
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/25" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[1.5rem] border border-[#FF5C24]/25 bg-[linear-gradient(180deg,rgba(255,92,36,0.08),rgba(255,92,36,0.02))] p-6 sm:p-8">
              <p className="text-sm font-medium text-[#FF8A5C]">Con MAT</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/80">
                {[
                  'Gestión centralizada con menos fricción diaria.',
                  'Más claridad para el equipo y mejor seguimiento.',
                  'Una base ordenada para crecer con proceso.'
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#FF5C24]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ===== Pricing ===== */}
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <section id="precio" className="scroll-mt-28 sm:scroll-mt-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Planes</SectionEyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Probá Pro gratis. Elegí lo que acompaña tu operación.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60">
              Empezá con 7 días de Pro completo, sin tarjeta. Lite te deja
              arrancar por menos, y Ultra suma recompensas, ingreso QR y cobros
              sin comisión.
            </p>
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3 md:items-stretch">
            {/* PRO (starts the trial) */}
            <Reveal className="relative flex flex-col overflow-hidden rounded-[1.6rem] border border-[#FF5C24]/40 bg-[linear-gradient(180deg,rgba(255,92,36,0.10),rgba(255,92,36,0.015))] p-7 shadow-[0_30px_80px_-40px_rgba(255,92,36,0.6)] sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#FF5C24]/20 blur-3xl" />
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">
                  MAT Pro
                </p>
                <span className="rounded-full bg-[#FF5C24] px-3 py-1 text-xs font-semibold text-white">
                  7 días gratis
                </span>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.04em]">
                  Gratis
                </span>
                <span className="pb-1 text-sm text-white/55">por 7 días</span>
              </div>
              <p className="mt-2 text-sm text-white/60">
                {proPriceLabel ? (
                  <>
                    Luego{' '}
                    <span className="font-medium text-white">
                      {proPriceLabel}
                    </span>{' '}
                    / mes. Cancelás cuando quieras.
                  </>
                ) : (
                  'Acceso completo desde el primer día. Luego coordinamos el plan a la medida de tu gimnasio.'
                )}
              </p>

              <div className="mt-6 grid gap-3">
                {proFeatures.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <Check className="size-4 shrink-0 text-[#FF5C24]" />
                    <span className="text-white/85">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-col gap-2">
                <Button
                  size="lg"
                  onClick={() => setDialogMode('trial')}
                  className={orangeButtonClassName}
                >
                  Empezá gratis 7 días
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                <p className="text-center text-xs text-white/45">
                  Sin tarjeta de crédito
                </p>
              </div>
            </Reveal>

            {/* LITE */}
            <Reveal className="flex flex-col rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
                  MAT Lite
                </p>
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
                  Lo esencial
                </span>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.04em]">
                  {litePriceLabel ?? 'Consultar'}
                </span>
                {litePriceLabel ? (
                  <span className="pb-1 text-sm text-white/55">/ mes</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/60">
                {mercadoPagoCheckoutEnabled
                  ? 'Se cobra en pesos argentinos vía Mercado Pago.'
                  : 'Activación asistida mientras habilitamos el checkout automático.'}
              </p>

              <div className="mt-6 grid gap-3">
                {liteFeatures.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <Check className="size-4 shrink-0 text-white/40" />
                    <span className="text-white/75">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-1 flex-col justify-end gap-2">
                {mercadoPagoCheckoutEnabled ? (
                  <Button
                    size="lg"
                    onClick={() => setDialogMode('lite')}
                    className={subtleButtonClassName}
                  >
                    Suscribirme a Lite
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                ) : (
                  <Button asChild size="lg" className={subtleButtonClassName}>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackWhatsAppClick('pricing_card_lite')}
                    >
                      Consultar activación
                      <MessageCircle className="ml-2 size-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Reveal>

            {/* ULTRA */}
            <Reveal className="flex flex-col rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
                  MAT Ultra
                </p>
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
                  Sin comisiones
                </span>
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.04em]">
                  {ultraPriceLabel ?? 'Consultar'}
                </span>
                {ultraPriceLabel ? (
                  <span className="pb-1 text-sm text-white/55">/ mes</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/60">
                MAT no se queda con nada de lo que cobrás a tus socios.
              </p>

              <div className="mt-6 grid gap-3">
                {ultraFeatures.map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <Check className="size-4 shrink-0 text-white/40" />
                    <span className="text-white/75">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-1 flex-col justify-end gap-2">
                {mercadoPagoCheckoutEnabled ? (
                  <Button
                    size="lg"
                    onClick={() => setDialogMode('ultra')}
                    className={subtleButtonClassName}
                  >
                    Suscribirme a Ultra
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                ) : (
                  <Button asChild size="lg" className={subtleButtonClassName}>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackWhatsAppClick('pricing_card_ultra')}
                    >
                      Consultar activación
                      <MessageCircle className="ml-2 size-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      </div>

      {/* ===== Final CTA ===== */}
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <section
            id="contacto"
            className="relative scroll-mt-28 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C0C0E] px-6 py-12 sm:scroll-mt-32 sm:px-10 sm:py-16"
          >
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(255,92,36,0.16),transparent_70%)]" />
            <div className="mx-auto max-w-2xl text-center">
              <SectionEyebrow>Empezá hoy</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                Ordená la operación de tu gimnasio esta semana.
              </h2>
              <p className="mt-4 text-base leading-7 text-white/65">
                Activá tu prueba Pro de 7 días o escribinos por WhatsApp y te
                mostramos cómo se adapta MAT a tu día a día.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  onClick={() => setDialogMode('trial')}
                  className={orangeButtonClassName}
                >
                  Empezá gratis 7 días
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                <Button asChild size="lg" className={subtleButtonClassName}>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWhatsAppClick('footer_cta')}
                  >
                    Escribir por WhatsApp
                    <MessageCircle className="ml-2 size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </section>
        </Reveal>
      </div>

      {/* ===== Footer ===== */}
      <footer className="border-t border-white/8 px-4 py-10 pb-28 sm:px-6 sm:pb-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <Image
              src={wolf}
              alt="Mascota de MAT"
              width={44}
              height={44}
              sizes="44px"
              className="size-11 rounded-full bg-white/[0.04] object-cover opacity-90 grayscale"
            />
            <div>
              <Logo className="h-6 w-auto" />
              <p className="mt-1 text-xs text-white/45">
                Control y orden para tu gimnasio.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 text-sm text-white/45 sm:items-end">
            <div className="flex items-center gap-4">
              <a href="#funciones" className={navLinkClassName}>
                Funciones
              </a>
              <a href="#precio" className={navLinkClassName}>
                Precio
              </a>
              <Link href="/invite-code" className={navLinkClassName}>
                Invitación
              </Link>
            </div>
            <p className="mt-2">
              &copy; 2026 MAT. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
