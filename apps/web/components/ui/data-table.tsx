"use client"
"use no memo"

import Image from "next/image"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import matWolfLooking from "@/assets/mat-wolf-looking.png"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  // useReactTable returns unstable refs; component is opted out via "use no memo"
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API incompatible with React Compiler memoization
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const hasRows = table.getRowModel().rows?.length > 0

  return (
    <div className="overflow-hidden rounded-md border">
      {hasRows ? (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <div className="relative w-full overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
            </table>
          </div>
          <Empty className="h-32 border-0 rounded-none border-t">
            <EmptyHeader>
              <EmptyMedia>
                <Image
                  src={matWolfLooking}
                  alt=""
                  className="h-14 w-14 object-contain"
                />
              </EmptyMedia>
              <EmptyTitle>No hay resultados</EmptyTitle>
              <EmptyDescription>
                No se encontraron registros para mostrar.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </>
      )}
    </div>
  )
}
