import type { HttpContext } from '@adonisjs/core/http'
import { getMemoryRedis, PROC_KEY, IDX_KEY } from '#services/memory_sync'

/**
 * role-memory-srv routes, re-homed onto the control-plane edge (Wave 1.2).
 *   GET /procedures/:role → role procedure index ([] if uncached)
 *   GET /procedure/:slug  → full procedure card (404 if uncached)
 */
export default class MemoryController {
  async procedures({ params, response }: HttpContext) {
    try {
      const data = await getMemoryRedis().get(IDX_KEY(params.role))
      return response.json(data ? JSON.parse(data) : [])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  async procedure({ params, response }: HttpContext) {
    try {
      const data = await getMemoryRedis().get(PROC_KEY(params.slug))
      if (!data) {
        return response.status(404).json({ error: 'Procedure not found' })
      }
      return response.json(JSON.parse(data))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }
}
