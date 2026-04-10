"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ResponsiveActionButtonProps = Omit<ButtonProps, "children"> & {
  icon: React.ReactNode;
  label: string;
  tooltip?: React.ReactNode;
  mobileSize?: "default" | "sm";
};

const mobileSizeClasses = {
  default: "h-9 w-9 p-0 md:h-9 md:w-auto md:px-4 md:py-2",
  sm: "h-8 w-8 p-0 md:h-8 md:w-auto md:px-3 md:py-2",
} as const;

export function ResponsiveActionButton({
  icon,
  label,
  tooltip,
  className,
  mobileSize = "default",
  ...props
}: ResponsiveActionButtonProps) {
  const button = (
    <Button
      {...props}
      aria-label={props["aria-label"] ?? label}
      className={cn("gap-0 md:gap-2", mobileSizeClasses[mobileSize], className)}
    >
      {icon}
      <span className="sr-only md:not-sr-only">{label}</span>
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
