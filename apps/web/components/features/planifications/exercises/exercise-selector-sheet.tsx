'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import ExerciseSelector from './exercise-selector'

interface ExerciseSelectorSheetProps {
  onSelect: (exercise: { id: string; name: string }) => void
}

export default function ExerciseSelectorSheet({
  onSelect,
}: ExerciseSelectorSheetProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (exercise: { id: string; name: string }) => {
    onSelect(exercise)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Agregar ejercicio
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Seleccionar ejercicio</SheetTitle>
          <SheetDescription>
            Busca y selecciona un ejercicio de la biblioteca
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <ExerciseSelector
            onSelect={handleSelect}
            className="max-h-[calc(100vh-250px)]"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
