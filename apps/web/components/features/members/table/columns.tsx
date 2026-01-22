"use client"

import { ColumnDef } from "@tanstack/react-table"
import type { Member } from "@repo/core/types"

export const columns: ColumnDef<Member>[] = [
  {
    accessorKey: "name",
    header: "Nombre",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Rol",
  },
  {
    accessorKey: "status",
    header: "Estado",
  },
  {
    accessorKey: "createdAt",
    header: "Creado el",
  },
]