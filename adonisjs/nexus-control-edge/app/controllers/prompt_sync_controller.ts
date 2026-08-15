import type { HttpContext } from '@adonisjs/core/http'
import { getRedis, syncAll, PROC_KEY, IDX_KEY, TASK_IDX_KEY } from '#services/prompt_sync'
import { syncMemory } from '#services/memory_sync'

/**
 * tackle-prompt-sync-srv routes, re-homed onto the control-plane edge
 * (Wave 1.1). Same wire surface as the retired Express service:
 *   GET  /prompts/:role        → role prompt index ([] if uncached)
 *   GET  /prompt/:role/:slug   → full prompt card (404 if uncached)
 *   GET  /tasks/:role          → role task index ([] if uncached)
 *   POST /refresh              → full PG→Redis sync
 */
export default class PromptSyncController {
  async listRolePrompts({ params, response }: HttpContext) {
    try {
      const data = await getRedis().get(IDX_KEY(params.role))
      return response.json(data ? JSON.parse(data) : [])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  async getPromptCard({ params, response }: HttpContext) {
    try {
      const data = await getRedis().get(PROC_KEY(params.role, params.slug))
      if (!data) {
        return response.status(404).json({ error: 'Prompt not found' })
      }
      return response.json(JSON.parse(data))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  async listRoleTasks({ params, response }: HttpContext) {
    try {
      const data = await getRedis().get(TASK_IDX_KEY(params.role))
      return response.json(data ? JSON.parse(data) : [])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /refresh — repopulate both caches (prompt:* + mem:*) from PG. */
  async refresh(_ctx: HttpContext) {
    try {
      const [prompts, memory] = await Promise.all([syncAll(), syncMemory()])
      return { prompts, memory }
    } catch (err: any) {
      return { error: err.message }
    }
  }
}
