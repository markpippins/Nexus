import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * ui-tools navigation-link CRUD, re-homed onto the control-plane edge.
 * Backed by throttler.links (same table the Express ui-tools served).
 * Response shape matches the Express service (camelCase projection).
 */

const RETURNING = [
  'id',
  'address',
  'imagename',
  'text',
  'type',
  'sort_order',
  'created_at',
  'updated_at',
]

function toCamel(row: any) {
  if (!row) return row
  return {
    id: row.id,
    address: row.address,
    imagename: row.imagename,
    text: row.text,
    type: row.type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default class LinksController {
  /** GET /api/links — list ordered by sort_order */
  async index({ response }: HttpContext) {
    const rows = await db
      .from('throttler.links')
      .select('id', 'address', 'imagename', 'text', 'type', 'sort_order', 'created_at', 'updated_at')
      .orderBy('sort_order', 'asc')
    response.ok(rows.map(toCamel))
  }

  /** POST /api/links — create */
  async create({ request, response }: HttpContext) {
    const { address, imagename, text = null, type = 'link', sortOrder } = request.body()
    if (type === 'link' && (!address || !imagename)) {
      return response.badRequest({ error: 'address and imagename are required for type=link' })
    }
    if (type !== 'link' && type !== 'separator') {
      return response.badRequest({ error: 'type must be "link" or "separator"' })
    }
    const nextOrder =
      sortOrder ??
      (
        await db
          .from('throttler.links')
          .select(db.raw('COALESCE(MAX(sort_order), 0) + 1 as n'))
          .first()
      )?.n
    const [link] = await db
      .table('throttler.links')
      .insert({ address: address || '', imagename: imagename || '', text, type, sort_order: nextOrder })
      .returning(RETURNING)
    response.created(toCamel(link))
  }

  /** PATCH /api/links/reorder — transactional reorder, returns updated list */
  async reorder({ request, response }: HttpContext) {
    const { items } = request.body()
    if (!Array.isArray(items)) {
      return response.badRequest({ error: 'items array is required' })
    }
    const trx = await db.transaction()
    try {
      for (const item of items) {
        await trx
          .from('throttler.links')
          .where('id', item.id)
          .update({ sort_order: item.sortOrder })
      }
      await trx.commit()
    } catch (error: any) {
      await trx.rollback()
      return response.internalServerError({ error: error.message })
    }
    return this.index({ response } as any)
  }

  /** PATCH /api/links/:id — partial update */
  async update({ request, params, response }: HttpContext) {
    const { address, imagename, text, type, sortOrder } = request.body()
    if (type !== undefined && type !== 'link' && type !== 'separator') {
      return response.badRequest({ error: 'type must be "link" or "separator"' })
    }
    const patch: Record<string, any> = {}
    if (address !== undefined) patch.address = address
    if (imagename !== undefined) patch.imagename = imagename
    if (text !== undefined) patch.text = text
    if (type !== undefined) patch.type = type
    if (sortOrder !== undefined) patch.sort_order = sortOrder
    if (Object.keys(patch).length === 0) return response.ok({ ok: true })
    patch.updated_at = db.raw('now()')
    const [updated] = await db
      .from('throttler.links')
      .where('id', params.id)
      .update(patch)
      .returning(RETURNING)
    if (!updated) return response.notFound({ error: 'Link not found' })
    return response.ok(toCamel(updated))
  }

  /** DELETE /api/links/:id */
  async destroy({ params, response }: HttpContext) {
    const deleted = await db.from('throttler.links').where('id', params.id).delete()
    if (!deleted) return response.notFound({ error: 'Link not found' })
    return response.ok({ ok: true })
  }
}
