import { use } from 'react'
import NewDayPageClient from './new-day-page-client'

type SearchParamsInput = Record<string, string | string[] | undefined>

function getFirstQueryValue(
  params: SearchParamsInput,
  key: string
): string | undefined {
  const value = params[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default function NewDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParamsInput>
}) {
  const { id: planificationId } = use(params)
  const resolvedSearchParams = use(searchParams)
  const weekIndex = Number(getFirstQueryValue(resolvedSearchParams, 'weekIndex') ?? 0)
  const dayOfWeek = Number(getFirstQueryValue(resolvedSearchParams, 'dayOfWeek') ?? 1)

  return (
    <NewDayPageClient
      planificationId={planificationId}
      weekIndex={weekIndex}
      dayOfWeek={dayOfWeek}
    />
  )
}
