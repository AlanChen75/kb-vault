import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { getStats } from '../lib/notes'

const stats = new Hono<{ Bindings: Env; Variables: Variables }>()

stats.get('/', async (c) => {
  const user = c.get('user')
  const s = await getStats(c.env.DB, user.id)
  return c.json(s)
})

export default stats
