import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'auto-mark-class-no-shows',
  { minutes: 15 },
  internal.classReservations.autoMarkNoShows,
  {
    scheduleLimit: 100,
  }
)

crons.interval(
  'send-class-reminders-minus-1h',
  { minutes: 5 },
  internal.pushNotifications.sendPreClassReminders,
  {
    lookAheadMinutes: 60,
    windowMinutes: 10,
    scheduleLimit: 150,
  }
)

crons.interval(
  'send-attendance-reminders-plus-1h',
  { minutes: 5 },
  internal.pushNotifications.sendAttendanceReminders,
  {
    delayMinutes: 60,
    windowMinutes: 10,
    scheduleLimit: 150,
  }
)

crons.interval(
  'auto-suspend-unpaid-subscriptions',
  { hours: 1 },
  internal.memberPlanSubscriptions.autoSuspendUnpaid,
  {}
)

export default crons
