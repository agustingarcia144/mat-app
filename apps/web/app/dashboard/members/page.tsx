'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { DataTable } from '@/components/ui/data-table'
import { columns } from '@/components/features/members/table/columns'
import { mapMembershipsToMembers } from '@repo/core/utils'
import DataTableSkeleton from '@/components/ui/data-table-skeleton'
import { Input } from '@/components/ui/input'
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue,} from '@/components/ui/select'

type FilterType = 'none' | 'role' | 'status'

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? ''

export default function MembersPage() {
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships
  )

  const members = mapMembershipsToMembers(memberships || [])

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('none')
  const [filterValue, setFilterValue] = useState('')

  const availableRoles = useMemo(() => {
    return Array.from(
      new Set(members.map((m) => normalize(m.role)).filter(Boolean))
    )
  }, [members])

  const availableStatuses = useMemo(() => {
    return Array.from(
      new Set(members.map((m) => normalize(m.status)).filter(Boolean))
    )
  }, [members])

  const filteredMembers = useMemo(() => {
    const searchValue = normalize(search)
    const selectedValue = normalize(filterValue)

    const isAll =
      !selectedValue ||
      selectedValue === 'all' ||
      selectedValue === 'todos'

    return members.filter((m) => {
      const matchesSearch =
        !searchValue ||
        normalize(m.name).includes(searchValue) ||
        normalize(m.email).includes(searchValue)

      let matchesFilter = true

      if (filterType === 'role' && !isAll) {
        matchesFilter = normalize(m.role) === selectedValue
      }

      if (filterType === 'status' && !isAll) {
        matchesFilter = normalize(m.status) === selectedValue
      }

      return matchesSearch && matchesFilter
    })
  }, [members, search, filterType, filterValue])

  if (memberships === undefined) {
    return (
      <div className="container mx-auto py-10">
        <DataTableSkeleton columns={columns.length || 0} rows={10} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-4">

      {/* 🔧 TOOLBAR: BUSCADOR + FILTROS */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">

        {/* 🔍 BUSCADOR (IZQUIERDA) */}
        <Input
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:max-w-xs"
        />

        {/* FILTROS PEGADOS */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">

          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Filtros
          </span>

          {/* TIPO */}
          <Select
            value={filterType}
            onValueChange={(value) => {
              setFilterType(value as FilterType)
              setFilterValue('')
            }}
          >
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Todos</SelectItem>
              <SelectItem value="role">Rol</SelectItem>
              <SelectItem value="status">Estado</SelectItem>
            </SelectContent>
          </Select>

          {/* Todos */}
          {filterType !== 'none' && (
            <Select value={filterValue} onValueChange={setFilterValue}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>

                {filterType === 'role' &&
                  availableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}

                {filterType === 'status' &&
                  availableStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* 📋 TABLA */}
      <DataTable columns={columns} data={filteredMembers} />
    </div>
  )
}
