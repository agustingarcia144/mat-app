"use node"

import { internalAction } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'

type ExpoTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: {
    error?: string
  }
}

type ExpoPushResponse = {
  data?: ExpoTicket[]
  errors?: Array<{ code?: string; message?: string }>
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

export const sendExpoPushForEvent: ReturnType<typeof internalAction> = internalAction({
  args: {
    eventKey: v.string(),
    type: v.union(
      v.literal('class_cancelled'),
      v.literal('class_start_reminder'),
      v.literal('attendance_reminder')
    ),
    userId: v.string(),
    scheduleId: v.id('classSchedules'),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.runMutation(
      internal.pushNotifications.createNotificationEventIfMissing,
      {
        eventKey: args.eventKey,
        type: args.type,
        userId: args.userId,
        scheduleId: args.scheduleId,
      }
    )

    if (!event.created) {
      return {
        status: 'duplicate',
        eventId: event.eventId,
      } as const
    }

    const activeTokens = await ctx.runQuery(
      internal.pushNotifications.listActiveTokensByUser,
      { userId: args.userId }
    )

    if (activeTokens.length === 0) {
      await ctx.runMutation(internal.pushNotifications.markNotificationEventSkipped, {
        eventId: event.eventId,
        reason: 'No active push tokens found for user',
      })
      return {
        status: 'skipped',
        eventId: event.eventId,
      } as const
    }

    const accessToken = process.env.EXPO_ACCESS_TOKEN
    const invalidTokens: string[] = []
    let successfulTickets = 0
    let failedTickets = 0

    const messagePayload = activeTokens.map((tokenRecord) => ({
      to: tokenRecord.token,
      sound: 'default',
      title: args.title,
      body: args.body,
      data: args.data,
    }))

    const messageChunks = chunkArray(messagePayload, 100)

    for (const chunk of messageChunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      })

      if (!response.ok) {
        failedTickets += chunk.length
        continue
      }

      const payload = (await response.json()) as ExpoPushResponse
      const tickets = payload.data ?? []

      for (let index = 0; index < tickets.length; index += 1) {
        const ticket = tickets[index]
        const sentToken = chunk[index]?.to

        if (ticket.status === 'ok') {
          successfulTickets += 1
          continue
        }

        failedTickets += 1
        if (sentToken && ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(sentToken)
        }
      }
    }

    if (invalidTokens.length > 0) {
      await ctx.runMutation(internal.pushNotifications.deactivateTokensInternal, {
        tokens: invalidTokens,
      })
    }

    if (successfulTickets > 0) {
      await ctx.runMutation(internal.pushNotifications.markNotificationEventSent, {
        eventId: event.eventId,
        tokenCount: activeTokens.length,
      })
      return {
        status: 'sent',
        eventId: event.eventId,
        sent: successfulTickets,
        failed: failedTickets,
      } as const
    }

    await ctx.runMutation(internal.pushNotifications.markNotificationEventFailed, {
      eventId: event.eventId,
      reason: 'Expo did not accept any push messages',
      tokenCount: activeTokens.length,
    })

    return {
      status: 'failed',
      eventId: event.eventId,
      sent: successfulTickets,
      failed: failedTickets,
    } as const
  },
})
