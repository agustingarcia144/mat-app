import React from 'react'
import Image from 'next/image'
import { Mail, SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextEffect } from '@/components/ui/text-effect'
import { AnimatedGroup } from '@/components/ui/animated-group'
import { HeroHeader } from './header'
import { LogoCloud } from './logo-cloud'
import { AppPreview } from './app-preview'
import appScreenshot from '@/assets/screenshot_app.png'
import webScreenshot from '@/assets/screenshot_web.png'
import screenshot from '@/assets/screenshot.png'

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        type: 'spring' as const,
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
}

export default function HeroSection() {
  return (
    <>
      <HeroHeader />

      <main className="overflow-hidden [--color-primary-foreground:var(--color-white)] [--color-primary:var(--color-green-600)]">
        <section>
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-32 lg:pt-48">
            <div className="relative z-10 mx-auto max-w-4xl text-center">
              <TextEffect
                preset="fade-in-blur"
                speedSegment={0.3}
                as="h1"
                className="text-balance text-5xl font-medium text-zinc-900 md:text-6xl dark:text-zinc-50"
              >
                Tu rutina de entrenamiento, organizada
              </TextEffect>
              <TextEffect
                per="line"
                preset="fade-in-blur"
                speedSegment={0.3}
                delay={0.5}
                as="p"
                className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-zinc-600 dark:text-zinc-400"
              >
                Planificá clases, seguí el progreso de tus alumnos y llevá tu
                gimnasio al siguiente nivel.
              </TextEffect>

              <AnimatedGroup
                variants={{
                  container: {
                    visible: {
                      transition: {
                        staggerChildren: 0.05,
                        delayChildren: 0.75,
                      },
                    },
                  },
                  ...transitionVariants,
                }}
                className="mt-12"
              >
                <form action="" className="mx-auto max-w-sm">
                  <div className="bg-background has-[input:focus]:ring-muted relative grid grid-cols-[1fr_auto] items-center rounded-[calc(var(--radius)+0.5rem)] border pr-2 shadow shadow-zinc-950/5 has-[input:focus]:ring-2">
                    <Mail className="pointer-events-none absolute inset-y-0 left-4 my-auto size-4" />

                    <input
                      placeholder="Tu correo electrónico"
                      className="h-12 w-full bg-transparent pl-12 focus:outline-none"
                      type="email"
                    />

                    <div className="md:pr-1.5 lg:pr-0">
                      <Button
                        aria-label="Enviar"
                        size="sm"
                        className="rounded-(--radius)"
                      >
                        <span className="hidden md:block">Comenzar</span>
                        <SendHorizonal
                          className="relative mx-auto size-5 md:hidden"
                          strokeWidth={2}
                        />
                      </Button>
                    </div>
                  </div>
                </form>

                <div
                  aria-hidden
                  className="bg-radial from-primary/50 dark:from-primary/25 relative mx-auto max-w-6xl to-transparent to-55% text-left overflow-visible mt-8"
                >
                  <div className="relative mx-auto w-full max-w-6xl origin-top md:scale-[1.08] lg:scale-[1.18] xl:scale-[1.22]">
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-0 h-40 w-[140%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(0,0,0,0.75),transparent_65%)]" />

                    <Image
                      src={screenshot}
                      alt="Vista del panel web de MAT"
                      className="relative z-10 w-full shadow-2xl shadow-black/50"
                      priority
                    />

                    {/* <Image
                      src={appScreenshot}
                      alt="Pantalla principal de la app móvil MAT"
                      className="absolute bottom-4 -right-4 z-20 w-[280px] sm:w-[340px] md:w-[400px] lg:w-[520px] xl:-right-40"
                      priority
                    /> */}
                  </div>

                  <div className="pointer-events-none absolute -inset-x-32 top-8 bottom-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] mix-blend-overlay bg-size-[20px_20px] [radial-gradient(ellipse_65%_65%_at_50%_35%,#000_70%,transparent_100%)] dark:opacity-10" />
                </div>
              </AnimatedGroup>
            </div>
          </div>
        </section>
        <LogoCloud />
      </main>
    </>
  )
}
