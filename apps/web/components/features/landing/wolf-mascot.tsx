'use client'

import * as React from 'react'
import Image from 'next/image'
import { Pause, Play } from 'lucide-react'
import {
  motion,
  useAnimationControls,
  useInView,
  useReducedMotion
} from 'motion/react'
import wolf from '@/assets/mat-wolf.png'
import styles from './landing.module.css'

export function WolfMascot() {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const greetingTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const controls = useAnimationControls()
  const reduceMotion = useReducedMotion()
  const inView = useInView(containerRef, { amount: 0.2 })
  const [paused, setPaused] = React.useState(false)
  const [greeting, setGreeting] = React.useState(false)
  const [greetingInProgress, setGreetingInProgress] = React.useState(false)

  React.useEffect(
    () => () => {
      if (greetingTimeout.current) clearTimeout(greetingTimeout.current)
    },
    []
  )

  async function greet() {
    if (greetingInProgress) return
    setGreeting(true)
    setGreetingInProgress(true)
    if (greetingTimeout.current) clearTimeout(greetingTimeout.current)
    greetingTimeout.current = setTimeout(() => setGreeting(false), 2400)
    if (!reduceMotion) {
      await controls.start({
        y: [0, -22, 0, -10, 0],
        rotate: [0, -7, 7, -3, 0],
        scale: [1, 1.04, 0.98, 1.02, 1],
        transition: { duration: 0.85, ease: 'easeInOut' }
      })
    }
    setGreetingInProgress(false)
  }

  return (
    <motion.div
      ref={containerRef}
      className={styles.mascot}
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: 0.4, duration: 0.6, type: 'spring', bounce: 0.3 }}
    >
      <motion.span
        role="status"
        className={styles.wolfGreeting}
        initial={false}
        animate={{
          opacity: greeting ? 1 : 0,
          y: greeting || reduceMotion ? 0 : 6
        }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        {greeting ? '¡Vamos por más!' : ''}
      </motion.span>
      <motion.div animate={controls}>
        <button
          type="button"
          onClick={greet}
          aria-label="Saludar al lobo de MAT"
          className={styles.wolfButton}
        >
          <span
            className={styles.wolfBreathing}
            data-paused={paused || !inView || greetingInProgress}
          >
            <Image
              src={wolf}
              alt="Lobo de MAT"
              sizes="(min-width: 1024px) 200px, 160px"
              className={styles.wolfImage}
              draggable={false}
            />
          </span>
        </button>
      </motion.div>
      <div className={styles.wolfCaption}>
        <span>Tu aliado, todos los días.</span>
        {!reduceMotion && (
          <button
            type="button"
            aria-label={
              paused
                ? 'Reanudar animación del lobo'
                : 'Pausar animación del lobo'
            }
            onClick={() => setPaused((value) => !value)}
            className={styles.wolfPause}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </motion.div>
  )
}
