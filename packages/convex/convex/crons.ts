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

export default crons
