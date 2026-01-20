import React from 'react'
import { UserButton } from '@clerk/nextjs'
import { ModeToggle } from '../theme/theme-toggle'
import { SidebarTrigger } from '@/components/ui/sidebar'

function UserProfile() {
  return (
    <header className="flex items-center justify-between p-4">
        <SidebarTrigger />
        <div className="flex items-center gap-2">
            <ModeToggle />
            <UserButton />
        </div>
    </header>
  )
}

export default UserProfile