'use client'

import styles from '../styles/index.module.css'
import { SignInButton, SignUpButton, SignedIn, UserButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className={styles.container}>
      <h1>Welcome</h1>
      <p>Sign in to access your dashboard</p>
      <SignedIn>
        <UserButton />
      </SignedIn>
      <SignInButton mode="modal">
        <Button>Sign In</Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button>Sign Up</Button>
      </SignUpButton>
    </div>
  )
}
