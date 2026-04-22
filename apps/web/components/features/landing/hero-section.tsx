"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import {
  ArrowRight,
  BarChart3,
  ChevronsUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Dumbbell,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Authenticated, Unauthenticated } from "convex/react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/features/landing/logo";
import { SignInDialog } from "@/components/features/auth/sign-in-dialog";
import { TextEffect } from "@/components/ui/text-effect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "motion/react";
import screenshot from "@/assets/screenshot.png";
import screenshotApp from "@/assets/screenshot_app.png";
import screenshotWeb from "@/assets/screenshot_web.png";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const productHighlights = [
  {
    icon: CalendarDays,
    title: "Clases y agenda",
    description:
      "Organiza horarios, cupos y reservas para que todo el staff trabaje con una sola agenda.",
  },
  {
    icon: Dumbbell,
    title: "Planificaciones",
    description:
      "Crea rutinas, semanas de trabajo y ejercicios con una estructura clara y facil de seguir.",
  },
  {
    icon: Users,
    title: "Socios y equipo",
    description:
      "Centraliza miembros, invitaciones y seguimiento del gimnasio sin usar planillas sueltas.",
  },
  {
    icon: CreditCard,
    title: "Pagos y planes",
    description:
      "Gestiona membresias, estados de pago, comprobantes y revisiones desde un solo lugar.",
  },
  {
    icon: BarChart3,
    title: "Metricas",
    description:
      "Mira ingresos, uso del sistema y datos clave para tomar decisiones con mas contexto.",
  },
  {
    icon: ShieldCheck,
    title: "Orden operativo",
    description:
      "Roles, permisos y procesos mas simples para que la gestion diaria no dependa de memoria.",
  },
];

const differentiators = [
  "Pensado para gimnasios y boxes que necesitan orden sin sumar complejidad.",
  "Interfaz clara para administrar clases, rutinas, pagos y miembros.",
  "Flujo web para el staff y experiencia movil para acompanar el dia a dia.",
];

const quickStats = [
  { value: "Clases", label: "agenda y cupos" },
  { value: "Rutinas", label: "planificacion estructurada" },
  { value: "Pagos", label: "seguimiento mas simple" },
];

const productGallery = [
  {
    image: screenshotWeb,
    alt: "Vista web de MAT con dashboard y gestion del gimnasio",
    eyebrow: "Vista web",
    title: "Panel para administrar el gimnasio",
  },
  {
    image: screenshot,
    alt: "Vista general de MAT con planificaciones y experiencia movil",
    eyebrow: "Operacion centralizada",
    title: "Todo conectado en una sola experiencia",
  },
  {
    image: screenshotApp,
    alt: "Vista movil de MAT para seguir clases y rutinas",
    eyebrow: "Vista movil",
    title: "Seguimiento simple desde el celular",
  },
];

const blackButtonClassName =
  "rounded-full border border-black bg-black px-5 text-white hover:bg-[#222222] hover:text-white dark:border-white/14 dark:bg-black dark:hover:bg-[#171717]";

const compactBlackButtonClassName =
  "rounded-full border border-black bg-black px-4 py-2 text-sm text-white hover:bg-[#222222] hover:text-white dark:border-white/14 dark:bg-black dark:hover:bg-[#171717]";

const orangeButtonClassName =
  "rounded-full border border-[#ff6a2a] bg-[#ff6a2a] px-5 text-white hover:border-[#e85e21] hover:bg-[#e85e21] hover:text-white dark:border-[#ff6a2a] dark:bg-[#ff6a2a] dark:hover:bg-[#e85e21]";

const navLinkClassName =
  "text-sm font-medium text-black/72 transition-colors hover:text-black dark:text-white/72 dark:hover:text-white";

const revealVariants = {
  hidden: {
    opacity: 0,
    filter: "blur(12px)",
    y: 20,
  },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: {
      duration: 1,
    },
  },
};

function Reveal({
  children,
  className,
  amount = 0.2,
  once = false,
}: {
  children: React.ReactNode;
  className?: string;
  amount?: number;
  once?: boolean;
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
  );
}

function RevealGroup({
  children,
  className,
  amount = 0.18,
  stagger = 0.08,
  once = false,
}: {
  children: React.ReactNode;
  className?: string;
  amount?: number;
  stagger?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren: 0.04,
          },
        },
      }}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div key={index} variants={revealVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

function trackWhatsAppClick(source: string) {
  window.fbq?.("trackCustom", "WhatsAppContactClick", {
    source,
    channel: "whatsapp",
  });
}

function WhatsAppFloatingButton() {
  const whatsappHref =
    "https://wa.me/5491138846078?text=Hola%2C%20quiero%20conocer%20MAT";

  return (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noreferrer"
      aria-label="Contactar por WhatsApp"
      onClick={() => trackWhatsAppClick("floating_button")}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-3 rounded-full border border-emerald-400/60 bg-[#111111] px-3 py-3 text-sm font-medium text-white shadow-[0_18px_45px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:-translate-y-0.5 dark:border-emerald-400/50 dark:bg-black sm:bottom-5 sm:right-5 sm:px-4"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500 text-white">
        <MessageCircle className="size-5" />
      </span>
      <span className="hidden sm:block">Contactanos por WhatsApp</span>
    </a>
  );
}

export default function HeroSection() {
  const { resolvedTheme } = useTheme();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [mounted, setMounted] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const whatsappHref =
    "https://wa.me/5491138846078?text=Hola%2C%20quiero%20conocer%20MAT";
  const isDark = mounted && resolvedTheme === "dark";

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) =>
        current === productGallery.length - 1 ? 0 : current + 1,
      );
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, []);

  const goToPrevSlide = React.useCallback(() => {
    setActiveSlide((current) =>
      current === 0 ? productGallery.length - 1 : current - 1,
    );
  }, []);

  const goToNextSlide = React.useCallback(() => {
    setActiveSlide((current) =>
      current === productGallery.length - 1 ? 0 : current + 1,
    );
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f5f2] text-[#111111] transition-colors dark:bg-[#0f0f10] dark:text-white">
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
          style={{ display: "none" }}
          src="https://www.facebook.com/tr?id=1304928111588479&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>

      <WhatsAppFloatingButton />

      <div className="absolute inset-x-0 top-0 -z-0 h-[560px] bg-[radial-gradient(circle_at_top,rgba(43,200,183,0.18),transparent_40%),radial-gradient(circle_at_20%_20%,rgba(155,153,254,0.16),transparent_30%),linear-gradient(180deg,#f2f0eb_0%,#f6f5f2_55%,#f6f5f2_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(43,200,183,0.16),transparent_35%),radial-gradient(circle_at_20%_20%,rgba(155,153,254,0.12),transparent_28%),linear-gradient(180deg,#101112_0%,#0f0f10_60%,#0f0f10_100%)]" />

      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-5">
        <Reveal amount={0} once>
          <div
            className={`mx-auto rounded-[1.6rem] border border-black/8 bg-[#f6f5f2]/78 px-4 py-3 shadow-[0_12px_36px_rgba(17,17,17,0.08)] backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-[#0f0f10]/78 dark:shadow-[0_14px_36px_rgba(0,0,0,0.28)] ${
              isScrolled ? "max-w-5xl px-3 py-2.5 sm:px-4" : "max-w-7xl"
            }`}
          >
            <div className="relative flex items-center justify-between gap-3">
            <Link
              href="/"
              aria-label="Ir al inicio"
              className={`shrink-0 rounded-full px-3 transition-all duration-300 ${
                isScrolled ? "py-1.5" : "py-2"
              }`}
            >
              <Logo className="h-6 w-auto" />
            </Link>

            <nav
              className={`absolute left-1/2 hidden -translate-x-1/2 items-center rounded-full border border-black/8 bg-white/50 shadow-sm transition-all duration-300 dark:border-white/10 dark:bg-white/5 md:flex ${
                isScrolled
                  ? "gap-1 px-2.5 py-1.5"
                  : "gap-2 px-3 py-2"
              }`}
            >
              <a
                href="#funciones"
                className={`${navLinkClassName} transition-all duration-300 ${
                  isScrolled ? "px-2 text-xs" : "px-3"
                }`}
              >
                Funciones
              </a>
              <a
                href="#producto"
                className={`${navLinkClassName} transition-all duration-300 ${
                  isScrolled ? "px-2 text-xs" : "px-3"
                }`}
              >
                Producto
              </a>
              <a
                href="#contacto"
                className={`${navLinkClassName} transition-all duration-300 ${
                  isScrolled ? "px-2 text-xs" : "px-3"
                }`}
              >
                Contacto
              </a>
              <Link
                href="/invite-code"
                className={`${navLinkClassName} transition-all duration-300 ${
                  isScrolled ? "px-2 text-xs" : "px-3"
                }`}
              >
                Activar
              </Link>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
            <Unauthenticated>
              <Button asChild className={`md:hidden ${compactBlackButtonClassName}`}>
                <Link href="/dashboard">Iniciar Sesión</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSignInOpen(true)}
                className={`hidden rounded-full border border-black/8 bg-[#f6f5f2]/82 px-5 text-sm font-medium text-black shadow-[0_12px_30px_rgba(17,17,17,0.08)] backdrop-blur-xl transition-all duration-300 hover:bg-[#ece9e2] hover:text-black dark:border-white/10 dark:bg-[#0f0f10]/80 dark:text-white dark:hover:bg-[#171719] md:inline-flex ${
                  isScrolled ? "px-4 py-2 text-xs" : ""
                }`}
              >
                Iniciar sesion
              </Button>
              <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
            </Unauthenticated>

            <Authenticated>
  <Button asChild className={`md:hidden ${compactBlackButtonClassName}`}>
    <Link href="/dashboard">Dashboard</Link>
  </Button>

  <Button
    asChild
    className={`hidden rounded-full border border-black/8 bg-[#f6f5f2]/82 px-5 text-sm font-medium text-black shadow-[0_12px_30px_rgba(17,17,17,0.08)] backdrop-blur-xl transition-all duration-300 hover:bg-[#ece9e2] hover:text-black dark:border-white/10 dark:bg-[#0f0f10]/80 dark:text-white dark:hover:bg-[#171719] md:inline-flex ${
      isScrolled ? "px-4 py-2 text-xs" : ""
    }`}
  >
    <Link href="/dashboard">Dashboard</Link>
  </Button>

  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="hidden md:flex items-center gap-2 rounded-full border border-black/8 bg-[#f6f5f2]/82 px-3 py-2 text-xs font-medium text-black shadow-[0_12px_30px_rgba(17,17,17,0.08)] backdrop-blur-xl transition-all duration-300 hover:bg-[#ece9e2] dark:border-white/10 dark:bg-[#0f0f10]/80 dark:text-white dark:hover:bg-[#171719]">
        <span className="flex size-6 items-center justify-center rounded-full bg-black/8 text-[10px] font-semibold dark:bg-white/10">
          {user?.fullName?.charAt(0).toUpperCase() ||
            user?.emailAddresses?.[0]?.emailAddress
              ?.charAt(0)
              .toUpperCase() ||
            "U"}
        </span>
        <ChevronsUpDown className="size-3" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40">
      <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
        <LogOut className="mr-2 size-4" />
        Cerrar sesion
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</Authenticated>
            </div>
          </div>
          </div>
        </Reveal>
      </header>

      <section className="relative">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-28 sm:px-6 sm:pb-16 sm:pt-32 lg:pt-36">
          <div className="relative z-10 max-w-6xl">
            <Reveal amount={0} once>
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs text-black/70 shadow-sm dark:border-white/12 dark:bg-white/6 dark:text-white/78 sm:text-sm">
                <Sparkles className="size-4 text-[#2bc8b7]" />
                <span className="truncate">
                  Gestion clara para gimnasios y centros de entrenamiento
                </span>
              </div>
            </Reveal>

            <Reveal amount={0.35} className="mt-5">
              <h1 className="max-w-none text-3xl leading-[1.02] font-semibold tracking-[-0.04em] sm:mt-6 sm:text-[2.7rem] md:max-w-[20ch] md:text-[2.85rem] lg:max-w-[24ch] lg:text-[2.95rem] xl:max-w-[26ch]">
                Control, orden y seguimiento real para tu gimnasio.
              </h1>
            </Reveal>

            <RevealGroup className="mt-8 sm:mt-10" amount={0.12} once>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button asChild size="lg" className={orangeButtonClassName}>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWhatsAppClick("hero_primary")}
                  >
                    Quiero una demo
                    <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>

                <Button asChild size="lg" className={blackButtonClassName}>
                  <a href="#funciones">
                    Ver funcionalidades
                    <ChevronRight className="ml-2 size-4" />
                  </a>
                </Button>
              </div>

              <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
                {quickStats.map((stat) => (
                  <div
                    key={stat.value}
                    className="rounded-3xl border border-black/8 bg-white/82 p-4 shadow-[0_10px_30px_rgba(17,17,17,0.04)] dark:border-white/12 dark:bg-[#18181a] dark:shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
                  >
                    <p className="text-lg font-semibold text-black dark:text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-sm text-black/62 dark:text-white/70">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </RevealGroup>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <RevealGroup>
          <section id="funciones" className="scroll-mt-28 sm:scroll-mt-32">
          <div className="max-w-xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#2bc8b7]">
              Funcionalidades
            </p>
            <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] sm:text-xl md:text-2xl">
              Todo lo importante del gimnasio, conectado en un solo lugar.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-black/68 dark:text-white/72">
              La landing refleja funciones reales de MAT para que el valor del
              producto se entienda rapido y sin ruido visual.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {productHighlights.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="rounded-[1.35rem] border border-black/8 bg-white/78 p-5 shadow-[0_16px_40px_rgba(17,17,17,0.05)] dark:border-white/10 dark:bg-[#151517] dark:shadow-[0_20px_45px_rgba(0,0,0,0.24)]"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(155,153,254,0.18),rgba(43,200,183,0.2))] text-[#111111]">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-black/64 dark:text-white/72">
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>
          </section>
        </RevealGroup>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <RevealGroup>
          <section id="producto" className="scroll-mt-28 sm:scroll-mt-32">
          <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-[1.35rem] border border-black/8 bg-[#111111] p-5 text-white shadow-[0_24px_70px_rgba(17,17,17,0.16)] dark:border-white/10 sm:rounded-[1.5rem] sm:p-6">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#2bc8b7]">
                Por que MAT
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                Simple y clara
              </h2>
              <div className="mt-4 space-y-3">
                {differentiators.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#2bc8b7]" />
                    <p className="text-sm leading-6 text-white/82">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-black/8 bg-white/78 p-5 dark:border-white/10 dark:bg-[#151517] sm:rounded-[1.5rem] sm:p-6">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#9b99fe]">
                Que resuelve
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.15rem] bg-[#f3f1eb] p-4 dark:bg-[#1b1b1d]">
                  <p className="text-sm font-medium text-black/60 dark:text-white/60">
                    Antes de MAT
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-black/70 dark:text-white/72">
                    <li>Horarios repartidos en chats y notas.</li>
                    <li>Pagos sin seguimiento centralizado.</li>
                    <li>Rutinas y clases sin una vista clara.</li>
                  </ul>
                </div>
                <div className="rounded-[1.15rem] bg-[linear-gradient(180deg,rgba(155,153,254,0.12),rgba(43,200,183,0.12))] p-4 dark:bg-[linear-gradient(180deg,rgba(155,153,254,0.16),rgba(43,200,183,0.14))]">
                  <p className="text-sm font-medium text-black/60 dark:text-white/68">
                    Con MAT
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-black/75 dark:text-white/78">
                    <li>Gestion centralizada con menos friccion diaria.</li>
                    <li>Mas claridad para el equipo y mejor seguimiento.</li>
                    <li>Una base ordenada para crecer con proceso.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[1.1rem] border border-black/8 bg-white/78 p-3 shadow-[0_20px_55px_rgba(17,17,17,0.06)] dark:border-white/10 dark:bg-[#151517] dark:shadow-[0_20px_55px_rgba(0,0,0,0.24)] sm:rounded-[1.3rem] sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#2bc8b7]">
                  Producto
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                  Recorre MAT en imagenes
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goToPrevSlide}
                  aria-label="Imagen anterior"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-black/10 bg-white text-black transition-colors hover:bg-black hover:text-white dark:border-white/12 dark:bg-[#1c1c1f] dark:text-white dark:hover:bg-white dark:hover:text-black"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNextSlide}
                  aria-label="Imagen siguiente"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-black/10 bg-white text-black transition-colors hover:bg-black hover:text-white dark:border-white/12 dark:bg-[#1c1c1f] dark:text-white dark:hover:bg-white dark:hover:text-black"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="relative mx-auto max-w-xl overflow-hidden rounded-[0.95rem] border border-black/8 bg-[#0f0f10] p-1.5 dark:border-white/10 sm:rounded-[1.1rem]">
                <div className="relative h-[180px] w-full sm:h-[220px] lg:h-[250px]">
                  <Image
                    src={productGallery[activeSlide].image}
                    alt={productGallery[activeSlide].alt}
                    priority
                    fill
                    className="rounded-[0.8rem] object-contain sm:rounded-[1rem]"
                  />
                </div>
              </div>

              <div className="mx-auto mt-2 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#9b99fe]">
                    {productGallery[activeSlide].eyebrow}
                  </p>
                  <p className="mt-2 text-base font-medium text-black dark:text-white sm:text-lg">
                    {productGallery[activeSlide].title}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {productGallery.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      aria-label={`Ir a la imagen ${index + 1}`}
                      onClick={() => setActiveSlide(index)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === activeSlide
                          ? "w-8 bg-black dark:bg-white"
                          : "w-2.5 bg-black/20 dark:bg-white/25"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          </section>
        </RevealGroup>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <RevealGroup>
          <section id="contacto" className="scroll-mt-28 sm:scroll-mt-32">
          <div className="rounded-[1.6rem] border border-black/8 bg-[linear-gradient(135deg,#111111_0%,#1d1d1d_60%,#222222_100%)] px-6 py-8 text-white sm:rounded-[2.25rem] sm:px-8 sm:py-10 md:px-12 md:py-14 dark:border-white/10">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#2bc8b7]">
              Contacto
            </p>
            <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl md:text-4xl">
                  Si queres ver como se adapta MAT a tu gimnasio, hablanos por
                  WhatsApp.
                </h2>
                <p className="mt-4 text-sm leading-7 text-white/78 sm:text-base md:text-lg">
                  Te mostramos el flujo, las funciones disponibles y como ordenar
                  la operacion sin sumar herramientas innecesarias.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className={orangeButtonClassName}>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWhatsAppClick("footer_cta")}
                  >
                    Escribir al +54 9 11 3884-6078
                    <MessageCircle className="ml-2 size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" className={blackButtonClassName}>
                  <Link href="/invite-code">Ya tengo invitacion</Link>
                </Button>
              </div>
            </div>
          </div>
          </section>
        </RevealGroup>
      </div>

      <div className="border-t border-black/6 px-4 py-8 pb-28 dark:border-white/10 sm:px-6 sm:pb-8">
        <RevealGroup>
          <footer>
          <div className="mx-auto max-w-7xl text-center text-sm text-black/56 dark:text-white/56">
            <p>&copy; 2026 Mat. Todos los derechos reservados.</p>
          </div>
          </footer>
        </RevealGroup>
      </div>
    </main>
  );
}
