'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Dumbbell,
  PanelLeft
} from 'lucide-react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
} from 'motion/react'
import screenshotWeb from '@/public/landing/dashboard.jpg'
import mobileHome from '@/public/landing/mobile-home.png'
import classesCapture from '@/public/landing/classes.jpg'
import planificationsCapture from '@/public/landing/planifications.jpg'
import styles from './landing.module.css'

/** Product imagery stays separate from motion so captures can be refreshed easily. */
export function ProductScene() {
  const reduceMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const rotateX = useSpring(pointerY, { stiffness: 100, damping: 25 })
  const rotateY = useSpring(pointerX, { stiffness: 100, damping: 25 })
  const { scrollY } = useScroll()
  const scrollTilt = useTransform(scrollY, [0, 650], [8, 0])
  const tilt = useTransform(() => scrollTilt.get() + rotateX.get())
  const phoneY = useTransform(scrollY, [0, 650], [35, -12])

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 4)
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -3)
  }

  function resetPointer() {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <div
      className={styles.scene}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <div className={styles.sceneHalo} aria-hidden="true" />
      <motion.div
        className={styles.desktopFrame}
        style={reduceMotion ? undefined : { rotateX: tilt, rotateY }}
      >
        <div className={styles.windowBar} aria-hidden="true">
          <div className="flex gap-1.5">
            <span />
            <span />
            <span />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-white/40 sm:text-xs">
            <PanelLeft className="size-3" />
            <span>MAT / Tu espacio de trabajo</span>
          </div>
          <span className="text-[10px] tracking-[0.14em] text-white/35">
            WEB APP
          </span>
        </div>
        <Image
          src={screenshotWeb}
          alt="Dashboard de MAT con indicadores, tareas pendientes y agenda de clases"
          priority
          sizes="(max-width: 768px) 100vw, 1100px"
          className="h-auto w-full"
        />
      </motion.div>
      <motion.div
        className={styles.phoneFrame}
        style={reduceMotion ? undefined : { y: phoneY }}
      >
        <Image
          src={mobileHome}
          alt="Inicio de la app de MAT con calendario y entrenamiento completado"
          sizes="(max-width: 640px) 100px, 220px"
          className={`${styles.phoneScreenshot} h-auto w-full`}
        />
      </motion.div>
      <div className={styles.sceneCaption}>
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-[#FF5C24]" /> Un solo lugar.
          Todo tu gimnasio.
        </span>
        <a
          href="#producto"
          className="group flex items-center gap-2 text-white/70 transition-colors hover:text-white"
        >
          Explorá MAT{' '}
          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </a>
      </div>
    </div>
  )
}

const workflows = [
  {
    image: classesCapture,
    alt: 'Calendario de MAT con turnos, reservas y cupos de la semana',
    icon: CalendarDays,
    label: 'Organizá',
    title: 'Cada clase, en su lugar.',
    description:
      'Definí horarios, cupos y responsables. Tu equipo y tus socios consultan la misma agenda.',
    detail: 'Agenda · Reservas · Asistencia'
  },
  {
    image: planificationsCapture,
    alt: 'Planificaciones de entrenamiento de demostración organizadas en carpetas',
    icon: Dumbbell,
    label: 'Planificá',
    title: 'Un plan para cada objetivo.',
    description:
      'Ordená tus programas en carpetas y construí semanas de entrenamiento con tu biblioteca de ejercicios.',
    detail: 'Rutinas · Ejercicios · Seguimiento'
  },
  {
    image: screenshotWeb,
    alt: 'Inicio de MAT con indicadores de miembros, tareas pendientes y balance financiero',
    icon: BarChart3,
    label: 'Gestioná',
    title: 'Tu día, a primera vista.',
    description:
      'Consultá los indicadores del gimnasio, las clases que vienen y los pendientes que necesitan tu atención.',
    detail: 'Indicadores · Pendientes · Finanzas'
  }
]

export function WorkflowExplorer() {
  const [active, setActive] = React.useState(0)
  const reduceMotion = useReducedMotion()
  const item = workflows[active]

  return (
    <div className={styles.workflow}>
      <div
        role="tablist"
        aria-label="Cómo trabajás con MAT"
        className={styles.workflowTabs}
      >
        {workflows.map((workflow, index) => (
          <button
            key={workflow.label}
            id={`workflow-tab-${index}`}
            role="tab"
            aria-selected={active === index}
            aria-controls="workflow-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (active + 1) % workflows.length
                  : event.key === 'ArrowLeft'
                    ? (active + workflows.length - 1) % workflows.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? workflows.length - 1
                        : null
              if (next === null) return
              event.preventDefault()
              setActive(next)
              document.getElementById(`workflow-tab-${next}`)?.focus()
            }}
            className={styles.workflowTab}
          >
            <span className="font-mono text-[10px] opacity-45">
              0{index + 1}
            </span>
            <workflow.icon className="size-4" />
            {workflow.label}
            {active === index && (
              <motion.span
                layoutId="workflow-indicator"
                className={styles.tabIndicator}
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
              />
            )}
          </button>
        ))}
      </div>
      <div
        id="workflow-panel"
        role="tabpanel"
        aria-labelledby={`workflow-tab-${active}`}
        tabIndex={0}
      >
        <div className={styles.workflowPanel}>
          <motion.div
            key={active}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="text-xs font-medium text-[#FF875B]">{item.detail}</p>
            <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
              {item.title}
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/60 sm:text-base">
              {item.description}
            </p>
          </motion.div>
          <a
            href="#funciones"
            className="inline-flex shrink-0 items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            Ver todas las funciones <ArrowUpRight className="size-4" />
          </a>
        </div>
        <div className={styles.tourCapture}>
          <motion.div
            key={item.label}
            initial={reduceMotion ? false : { opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Image
              src={item.image}
              alt={item.alt}
              sizes="(max-width: 1024px) 100vw, 1100px"
              className="h-auto w-full"
            />
          </motion.div>
        </div>
        <p className="py-4 text-center text-[10px] tracking-wide text-white/35">
          Capturas de MAT · Organización de demostración
        </p>
      </div>
    </div>
  )
}
