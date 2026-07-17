"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrgRoleLabel } from "@/lib/security/roles";

export type StaffOption = {
  userId: string;
  fullName?: string;
  email?: string;
  role?: string;
};

type Props = {
  staff: StaffOption[];
  value?: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
};

function labelFor(option: StaffOption) {
  return option.fullName || option.email || option.userId;
}

export default function StaffSelect({
  staff,
  value,
  onChange,
  placeholder = "Seleccionar…",
  allowNone = true,
  noneLabel = "Sin asignar",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = staff.find((s) => s.userId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected ? labelFor(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>No se encontró personal.</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {noneLabel}
                </CommandItem>
              )}
              {staff.map((option) => (
                <CommandItem
                  key={option.userId}
                  value={`${labelFor(option)} ${option.email ?? ""}`}
                  onSelect={() => {
                    onChange(option.userId);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.userId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{labelFor(option)}</span>
                  {option.role && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {getOrgRoleLabel(option.role)}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
