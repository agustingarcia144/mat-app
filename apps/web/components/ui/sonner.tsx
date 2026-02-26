"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg rounded-2xl flex items-center justify-between gap-3 min-w-0",
          content: "flex-1 min-w-0 flex flex-col gap-1",
          title: "min-w-0",
          description: "group-[.toast]:text-muted-foreground min-w-0",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground shrink-0",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground shrink-0",
          closeButton: "shrink-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
