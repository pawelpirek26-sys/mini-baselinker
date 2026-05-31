// @ts-nocheck — Deno edge function (npm: specifiers, no tsconfig)
import postgres from 'npm:postgres@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT, jwtVerify } from 'npm:jose@5'
import { z } from 'npm:zod@3'

// ─── Init ─────────────────────────────────────────────────────────────────────

const DB_URL      = Deno.env.get('DATABASE_URL')!
const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWT_RAW     = Deno.env.get('JWT_SECRET') ?? 'change-me-in-prod'
const JWT_KEY     = new TextEncoder().encode(JWT_RAW)
const RESEND_KEY  = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Mini Baselinker <onboarding@resend.dev>'

let _db: ReturnType<typeof postgres> | null = null
function db(): ReturnType<typeof postgres> {
  if (!_db) _db = postgres(DB_URL, { ssl: 'require', max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, connection: { search_path: 'public,extensions' } })
  return _db
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })

function uid(): string { return crypto.randomUUID().replace(/-/g, '') }

// ─── Email ────────────────────────────────────────────────────────────────────

interface NotifSettings { listingError: boolean; listingActive: boolean; syncComplete: boolean; lowStock: boolean }
const NOTIF_DEFAULTS: NotifSettings = { listingError: true, listingActive: false, syncComplete: true, lowStock: true }

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  })
  if (!res.ok) console.error('Resend error', res.status, await res.text())
}

async function getNotifSettings(userId: string): Promise<{ email: string; settings: NotifSettings } | null> {
  const [u] = await db()`SELECT email,"notificationSettings" FROM "User" WHERE id=${userId}`
  if (!u) return null
  return { email: u.email, settings: { ...NOTIF_DEFAULTS, ...(u.notificationSettings ?? {}) } }
}

// ─── CORS & Responses ─────────────────────────────────────────────────────────

const ALLOWED = ['http://localhost:5173', 'https://mini-baselinker.vercel.app']

function cors(origin: string | null): Record<string, string> {
  const ao = origin && (ALLOWED.includes(origin) || /\.vercel\.app$/.test(origin)) ? origin : ALLOWED[0]
  return {
    'Access-Control-Allow-Origin': ao,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function R(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(req?.headers.get('Origin') ?? null) },
  })
}

function rawFile(body: string, ct: string, filename: string, req?: Request): Response {
  return new Response('﻿' + body, {
    headers: { 'Content-Type': `${ct}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${filename}"`, ...cors(req?.headers.get('Origin') ?? null) },
  })
}

function E(msg: string, status = 400, req?: Request): Response {
  return R({ error: msg }, status, req)
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

interface JWTPayload { userId: string; email: string; role: string }

async function sign(p: JWTPayload): Promise<string> {
  return new SignJWT(p as Record<string, unknown>).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(JWT_KEY)
}

async function auth(req: Request): Promise<JWTPayload> {
  const h = req.headers.get('Authorization') ?? ''
  if (!h.startsWith('Bearer ')) throw Object.assign(new Error('Brak tokenu'), { status: 401 })
  try {
    const { payload } = await jwtVerify(h.slice(7), JWT_KEY)
    return payload as unknown as JWTPayload
  } catch { throw Object.assign(new Error('Nieprawidłowy token'), { status: 401 }) }
}

// ─── Routing ──────────────────────────────────────────────────────────────────

function segs(req: Request): string[] {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean)
  const i = parts.indexOf('api')
  return i >= 0 ? parts.slice(i + 1) : []
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function handleAuth(req: Request, s: string[]): Promise<Response> {
  const [action] = s
  const d = db()

  if (req.method === 'POST' && action === 'register') {
    const body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2) }).parse(await req.json())
    const [ex] = await d`SELECT id FROM "User" WHERE email = ${body.email}`
    if (ex) return E('Konto z tym emailem już istnieje', 409, req)
    const id = uid(), now = new Date()
    const [{ hash }] = await d`SELECT extensions.crypt(${body.password}::text, extensions.gen_salt('bf', 10)) AS hash`
    await d`INSERT INTO "User" (id,email,password,name,role,"createdAt","updatedAt") VALUES (${id},${body.email},${hash},${body.name},'admin',${now},${now})`
    return R({ user: { id, email: body.email, name: body.name, role: 'admin' }, token: await sign({ userId: id, email: body.email, role: 'admin' }) }, 201, req)
  }

  if (req.method === 'POST' && action === 'login') {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(await req.json())
    const [u] = await d`SELECT * FROM "User" WHERE email = ${body.email} AND password = extensions.crypt(${body.password}::text, password) LIMIT 1`
    if (!u) return E('Nieprawidłowy email lub hasło', 401, req)
    return R({ user: { id: u.id, email: u.email, name: u.name, role: u.role }, token: await sign({ userId: u.id, email: u.email, role: u.role }) }, 200, req)
  }

  if (req.method === 'GET' && action === 'me') {
    const { userId } = await auth(req)
    const [u] = await d`SELECT id,email,name,role FROM "User" WHERE id = ${userId}`
    if (!u) return E('Użytkownik nie istnieje', 404, req)
    return R(u, 200, req)
  }

  if (req.method === 'GET' && action === 'notification-settings') {
    const { userId } = await auth(req)
    const ns = await getNotifSettings(userId)
    if (!ns) return E('Użytkownik nie istnieje', 404, req)
    return R(ns.settings, 200, req)
  }

  if (req.method === 'PATCH' && action === 'notification-settings') {
    const { userId } = await auth(req)
    const body = await req.json()
    const ns = await getNotifSettings(userId)
    if (!ns) return E('Użytkownik nie istnieje', 404, req)
    const updated: NotifSettings = { ...ns.settings }
    for (const k of ['listingError', 'listingActive', 'syncComplete', 'lowStock'] as (keyof NotifSettings)[]) {
      if (typeof body[k] === 'boolean') updated[k] = body[k]
    }
    await d`UPDATE "User" SET "notificationSettings"=${JSON.stringify(updated)} WHERE id=${userId}`
    return R(updated, 200, req)
  }

  if (req.method === 'POST' && action === 'test-email') {
    const { userId } = await auth(req)
    const ns = await getNotifSettings(userId)
    if (!ns) return E('Użytkownik nie istnieje', 404, req)
    if (!RESEND_KEY) return E('RESEND_API_KEY nie skonfigurowany w Edge Function', 503, req)
    await sendEmail(ns.email, 'Test powiadomień — Mini Baselinker',
      `<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#6366f1">Mini Baselinker</h2><p>Powiadomienia e-mail działają poprawnie ✅</p><p style="color:#64748b;font-size:13px">Wiadomość testowa wygenerowana ` + new Date().toLocaleString('pl-PL') + `</p></div>`)
    return R({ ok: true, sentTo: ns.email }, 200, req)
  }

  return E('Not found', 404, req)
}

// ─── PARTS ───────────────────────────────────────────────────────────────────

async function handleParts(req: Request, s: string[], url: URL): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  // GET /parts/stats
  if (m === 'GET' && s0 === 'stats') {
    const [row] = await d`
      SELECT COUNT(*) FILTER(WHERE TRUE) total, COUNT(*) FILTER(WHERE "isActive"=true) active, COUNT(*) FILTER(WHERE "isActive"=false) inactive
      FROM "Part" WHERE "userId"=${userId}
    `
    const cats = await d`SELECT category, COUNT(*) cnt FROM "Part" WHERE "userId"=${userId} GROUP BY category ORDER BY cnt DESC LIMIT 8`
    return R({ total: +row.total, active: +row.active, inactive: +row.inactive, byCategory: cats.map((r: any) => ({ category: r.category, count: +r.cnt })) }, 200, req)
  }

  // PATCH /parts/bulk
  if (m === 'PATCH' && s0 === 'bulk') {
    const { ids, action } = await req.json()
    if (!Array.isArray(ids) || !ids.length) return E('ids wymagane', 400, req)
    const [c] = await d`SELECT COUNT(*) n FROM "Part" WHERE id=ANY(${ids}::text[]) AND "userId"=${userId}`
    if (+c.n !== ids.length) return E('Brak dostępu', 403, req)
    if (action === 'delete') { await d`DELETE FROM "Part" WHERE id=ANY(${ids}::text[]) AND "userId"=${userId}` }
    else { await d`UPDATE "Part" SET "isActive"=${action === 'activate'},"updatedAt"=now() WHERE id=ANY(${ids}::text[]) AND "userId"=${userId}` }
    return R({ affected: ids.length }, 200, req)
  }

  // GET /parts
  if (m === 'GET' && !s0) {
    const page   = Math.max(1, +(url.searchParams.get('page') || 1))
    const limit  = Math.min(100, +(url.searchParams.get('limit') || 20))
    const search = url.searchParams.get('search') || ''
    const cat    = url.searchParams.get('category') || ''
    const cond   = url.searchParams.get('condition') || ''
    const active = url.searchParams.get('isActive') || ''
    const sortBy = url.searchParams.get('sortBy') || 'createdAt'
    const sortDir= url.searchParams.get('sortDir') || 'desc'
    const offset = (page - 1) * limit

    const colMap: Record<string, string> = { createdAt: '"createdAt"', name: 'name', priceNet: '"priceNet"', stock: 'stock' }
    const col = colMap[sortBy] ?? '"createdAt"'
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC'

    const conds = [`"userId" = $1`]
    const params: unknown[] = [userId]
    let n = 2
    if (search) { conds.push(`(name ILIKE $${n} OR "oemNumber" ILIKE $${n} OR "catalogNumber" ILIKE $${n})`); params.push(`%${search}%`); n++ }
    if (cat)    { conds.push(`category = $${n++}`); params.push(cat) }
    if (cond)   { conds.push(`condition = $${n++}`); params.push(cond) }
    if (active) { conds.push(`"isActive" = $${n++}`); params.push(active === 'true') }

    const where = conds.join(' AND ')
    const [items, [cnt]] = await Promise.all([
      d.unsafe(`SELECT *,(SELECT COUNT(*) FROM "Listing" l WHERE l."partId"=p.id) listing_count FROM "Part" p WHERE ${where} ORDER BY p.${col} ${dir} LIMIT $${n} OFFSET $${n+1}`, [...params, limit, offset]),
      d.unsafe(`SELECT COUNT(*) total FROM "Part" WHERE ${where}`, params),
    ])
    const ids = items.map((r: any) => r.id)
    const imgs = ids.length ? await d`SELECT DISTINCT ON("partId") * FROM "PartImage" WHERE "partId"=ANY(${ids}::text[]) ORDER BY "partId","order" ASC` : []
    const imgMap = Object.fromEntries(imgs.map((i: any) => [i.partId, i]))
    return R({
      items: items.map((r: any) => ({ ...r, images: imgMap[r.id] ? [imgMap[r.id]] : [], _count: { listings: +r.listing_count } })),
      pagination: { page, limit, total: +cnt.total, totalPages: Math.ceil(+cnt.total / limit) },
    }, 200, req)
  }

  // POST /parts
  if (m === 'POST' && !s0) {
    const body = await req.json()
    const id = uid(), now = new Date()
    const data = {
      id, "userId": userId, "createdAt": now, "updatedAt": now,
      name: body.name, "oemNumber": body.oemNumber ?? null, "catalogNumber": body.catalogNumber ?? null,
      ean: body.ean ?? null, category: body.category, subcategory: body.subcategory ?? null,
      condition: body.condition ?? 'NEW', "priceNet": body.priceNet, "priceBrutto": body.priceBrutto,
      "vatRate": body.vatRate ?? 23, stock: body.stock ?? 0, "stockMin": body.stockMin ?? 1,
      "descriptionShort": body.descriptionShort ?? null, "descriptionLong": body.descriptionLong ?? null,
      "technicalParams": body.technicalParams ? JSON.stringify(body.technicalParams) : null,
      "isActive": true, "externalId": null, "externalSource": null,
    }
    await d`INSERT INTO "Part" ${d(data)}`
    const [part] = await d`SELECT * FROM "Part" WHERE id=${id}`
    return R({ ...part, images: [], _count: { listings: 0 } }, 201, req)
  }

  // GET /parts/:id
  if (m === 'GET' && s0 && !s1) {
    const [part] = await d`SELECT * FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const [imgs, compat, listings] = await Promise.all([
      d`SELECT * FROM "PartImage" WHERE "partId"=${s0} ORDER BY "order" ASC`,
      d`SELECT * FROM "Compatibility" WHERE "partId"=${s0} ORDER BY brand,model`,
      d`SELECT l.*,t.id tid,t.name tname,t.portal tportal FROM "Listing" l JOIN "Template" t ON t.id=l."templateId" WHERE l."partId"=${s0} ORDER BY l."updatedAt" DESC`,
    ])
    return R({
      ...part,
      images: imgs,
      compatibility: compat,
      listings: listings.map((l: any) => ({ ...l, template: { id: l.tid, name: l.tname, portal: l.tportal } })),
    }, 200, req)
  }

  // PATCH /parts/:id
  if (m === 'PATCH' && s0 && !s1) {
    const [ex] = await d`SELECT id FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!ex) return E('Część nie znaleziona', 404, req)
    const body = await req.json()
    const fields: Record<string, unknown> = { updatedAt: new Date() }
    const allowed = ['name','oemNumber','catalogNumber','ean','category','subcategory','condition','priceNet','priceBrutto','vatRate','stock','stockMin','descriptionShort','descriptionLong','isActive']
    for (const k of allowed) if (k in body) fields[k] = body[k]
    if (body.technicalParams !== undefined) fields.technicalParams = body.technicalParams ? JSON.stringify(body.technicalParams) : null
    await d`UPDATE "Part" SET ${d(fields)} WHERE id=${s0}`
    const [part] = await d`SELECT * FROM "Part" WHERE id=${s0}`
    const imgs = await d`SELECT * FROM "PartImage" WHERE "partId"=${s0} ORDER BY "order" ASC`
    if ('stock' in fields && part.stock <= part.stockMin && part.stock >= 0) {
      getNotifSettings(userId).then(ns => {
        if (!ns?.settings.lowStock) return
        return sendEmail(ns.email, `Niski stan magazynowy: ${part.name}`,
          `<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#f59e0b">⚠️ Niski stan magazynowy</h2><p>Część <strong>${part.name}</strong> ma stan <strong style="color:#ef4444">${part.stock}</strong> szt. (minimum: ${part.stockMin}).</p></div>`)
      }).catch(e => console.error('notify stock', e))
    }
    return R({ ...part, images: imgs }, 200, req)
  }

  // DELETE /parts/:id
  if (m === 'DELETE' && s0 && !s1) {
    const [ex] = await d`SELECT id FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!ex) return E('Część nie znaleziona', 404, req)
    await d`DELETE FROM "Part" WHERE id=${s0}`
    return new Response(null, { status: 204, headers: cors(req.headers.get('Origin')) })
  }

  return E('Not found', 404, req)
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

async function handleTemplates(req: Request, s: string[], url: URL): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0] = s

  if (m === 'GET' && !s0) {
    const portal = url.searchParams.get('portal') || ''
    const rows = portal
      ? await d`SELECT t.*,(SELECT COUNT(*) FROM "Listing" l WHERE l."templateId"=t.id) listing_count FROM "Template" t WHERE t."userId"=${userId} AND t.portal=${portal} ORDER BY t.portal,t.name`
      : await d`SELECT t.*,(SELECT COUNT(*) FROM "Listing" l WHERE l."templateId"=t.id) listing_count FROM "Template" t WHERE t."userId"=${userId} ORDER BY t.portal,t.name`
    return R(rows.map((r: any) => ({ ...r, _count: { listings: +r.listing_count } })), 200, req)
  }

  if (m === 'GET' && s0) {
    const [t] = await d`SELECT * FROM "Template" WHERE id=${s0} AND "userId"=${userId}`
    if (!t) return E('Szablon nie znaleziony', 404, req)
    return R(t, 200, req)
  }

  if (m === 'POST' && !s0) {
    const body = await req.json()
    const id = uid(), now = new Date()
    if (body.isDefault) await d`UPDATE "Template" SET "isDefault"=false WHERE "userId"=${userId} AND portal=${body.portal}`
    const data = {
      id, userId, createdAt: now, updatedAt: now,
      name: body.name, description: body.description ?? null, portal: body.portal,
      isDefault: body.isDefault ?? false, isActive: body.isActive ?? true,
      fieldMapping: JSON.stringify(body.fieldMapping ?? {}), portalConfig: JSON.stringify(body.portalConfig ?? {}),
      portalCategoryId: body.portalCategoryId ?? null, portalCategoryName: body.portalCategoryName ?? null,
    }
    await d`INSERT INTO "Template" ${d(data)}`
    const [t] = await d`SELECT * FROM "Template" WHERE id=${id}`
    return R(t, 201, req)
  }

  if (m === 'PATCH' && s0) {
    const [ex] = await d`SELECT * FROM "Template" WHERE id=${s0} AND "userId"=${userId}`
    if (!ex) return E('Szablon nie znaleziony', 404, req)
    const body = await req.json()
    if (body.isDefault) await d`UPDATE "Template" SET "isDefault"=false WHERE "userId"=${userId} AND portal=${ex.portal}`
    const fields: Record<string, unknown> = { updatedAt: new Date() }
    const allowed = ['name','description','isDefault','isActive','portalCategoryId','portalCategoryName']
    for (const k of allowed) if (k in body) fields[k] = body[k]
    if (body.fieldMapping !== undefined) fields.fieldMapping = JSON.stringify(body.fieldMapping)
    if (body.portalConfig  !== undefined) fields.portalConfig  = JSON.stringify(body.portalConfig)
    await d`UPDATE "Template" SET ${d(fields)} WHERE id=${s0}`
    const [t] = await d`SELECT * FROM "Template" WHERE id=${s0}`
    return R(t, 200, req)
  }

  if (m === 'DELETE' && s0) {
    const [ex] = await d`SELECT id FROM "Template" WHERE id=${s0} AND "userId"=${userId}`
    if (!ex) return E('Szablon nie znaleziony', 404, req)
    const [cnt] = await d`SELECT COUNT(*) n FROM "Listing" WHERE "templateId"=${s0}`
    if (+cnt.n > 0) return E(`Szablon ma ${cnt.n} powiązanych wystawień – usuń je najpierw`, 409, req)
    await d`DELETE FROM "Template" WHERE id=${s0}`
    return new Response(null, { status: 204, headers: cors(req.headers.get('Origin')) })
  }

  return E('Not found', 404, req)
}

// ─── LISTINGS ────────────────────────────────────────────────────────────────

async function handleListings(req: Request, s: string[], url: URL): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  if (m === 'GET' && !s0) {
    const partId = url.searchParams.get('partId') || ''
    const portal = url.searchParams.get('portal') || ''
    const status = url.searchParams.get('status') || ''
    const conds = [`l."userId"=$1`]
    const params: unknown[] = [userId]
    let n = 2
    if (partId) { conds.push(`l."partId"=$${n++}`); params.push(partId) }
    if (portal) { conds.push(`l.portal=$${n++}`); params.push(portal) }
    if (status) { conds.push(`l.status=$${n++}`); params.push(status) }
    const rows = await d.unsafe(
      `SELECT l.*,p.id pid,p.name pname,p."oemNumber" poem,t.id tid,t.name tname,t.portal tportal FROM "Listing" l JOIN "Part" p ON p.id=l."partId" JOIN "Template" t ON t.id=l."templateId" WHERE ${conds.join(' AND ')} ORDER BY l."updatedAt" DESC`,
      params
    )
    return R(rows.map((l: any) => ({
      ...l,
      part: { id: l.pid, name: l.pname, oemNumber: l.poem },
      template: { id: l.tid, name: l.tname, portal: l.tportal },
    })), 200, req)
  }

  if (m === 'POST' && s0 === 'bulk') {
    const { partId, templateIds } = await req.json()
    const [part] = await d`SELECT id FROM "Part" WHERE id=${partId} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const results = await Promise.allSettled(templateIds.map(async (templateId: string) => {
      const [tmpl] = await d`SELECT * FROM "Template" WHERE id=${templateId} AND "userId"=${userId}`
      if (!tmpl) throw new Error('Szablon nie znaleziony')
      const id = uid(), now = new Date()
      await d.unsafe(
        `INSERT INTO "Listing" (id,"partId","templateId","userId",portal,status,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$6) ON CONFLICT ("partId","templateId") DO UPDATE SET status='PENDING',"errorMessage"=NULL,"updatedAt"=$6`,
        [id, partId, templateId, userId, tmpl.portal, now]
      )
      return { templateId }
    }))
    return R({ summary: results.map((r, i) => ({ templateId: templateIds[i], status: r.status })), partId }, 200, req)
  }

  if (m === 'POST' && !s0) {
    const { partId, templateId } = await req.json()
    const [[part],[tmpl]] = await Promise.all([
      d`SELECT id FROM "Part" WHERE id=${partId} AND "userId"=${userId}`,
      d`SELECT * FROM "Template" WHERE id=${templateId} AND "userId"=${userId}`,
    ])
    if (!part) return E('Część nie znaleziona', 404, req)
    if (!tmpl) return E('Szablon nie znaleziony', 404, req)
    const id = uid(), now = new Date()
    await d.unsafe(
      `INSERT INTO "Listing" (id,"partId","templateId","userId",portal,status,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$6) ON CONFLICT ("partId","templateId") DO UPDATE SET status='DRAFT',"errorMessage"=NULL,"errorDetails"=NULL,"updatedAt"=$6`,
      [id, partId, templateId, userId, tmpl.portal, now]
    )
    const [listing] = await d`SELECT * FROM "Listing" WHERE "partId"=${partId} AND "templateId"=${templateId}`
    return R(listing, 201, req)
  }

  // PATCH /listings/:id/status
  if (m === 'PATCH' && s0 && s1 === 'status') {
    const [listing] = await d`SELECT * FROM "Listing" WHERE id=${s0} AND "userId"=${userId}`
    if (!listing) return E('Wystawienie nie znalezione', 404, req)
    const body = await req.json()
    const now = new Date()
    await d`UPDATE "Listing" SET status=${body.status},"externalId"=${body.externalId??listing.externalId},"externalUrl"=${body.externalUrl??listing.externalUrl},"errorMessage"=${body.errorMessage??null},"updatedAt"=${now}${body.status==='ACTIVE'?d`,listedAt=${now}`:d``} WHERE id=${s0}`
    await d`INSERT INTO "ListingHistory" (id,"listingId",status,message,"createdAt") VALUES (${uid()},${s0},${body.status},${body.errorMessage??`Status zmieniony na ${body.status}`},${now})`
    const [updated] = await d`SELECT * FROM "Listing" WHERE id=${s0}`
    if (body.status === 'ERROR' || body.status === 'ACTIVE') {
      getNotifSettings(userId).then(ns => {
        if (!ns) return
        const should = body.status === 'ERROR' ? ns.settings.listingError : ns.settings.listingActive
        if (!should) return
        return d`SELECT name FROM "Part" WHERE id=${listing.partId}`.then(([p]: any[]) => {
          const partName = p?.name ?? listing.partId
          const subject = body.status === 'ERROR' ? `Błąd wystawienia: ${partName}` : `Wystawienie aktywne: ${partName}`
          const html = body.status === 'ERROR'
            ? `<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#ef4444">Błąd wystawienia</h2><p>Część <strong>${partName}</strong> — wystawienie na <strong>${listing.portal}</strong> zakończyło się błędem.</p>${body.errorMessage?`<p style="background:#1e293b;padding:8px;border-radius:6px;font-size:13px;color:#f87171">${body.errorMessage}</p>`:''}</div>`
            : `<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#22c55e">Wystawienie aktywne ✅</h2><p>Część <strong>${partName}</strong> została pomyślnie wystawiona na <strong>${listing.portal}</strong>.</p></div>`
          return sendEmail(ns.email, subject, html)
        })
      }).catch(e => console.error('notify listing', e))
    }
    return R(updated, 200, req)
  }

  // DELETE /listings/:id
  if (m === 'DELETE' && s0) {
    const [ex] = await d`SELECT id FROM "Listing" WHERE id=${s0} AND "userId"=${userId}`
    if (!ex) return E('Wystawienie nie znalezione', 404, req)
    await d`DELETE FROM "Listing" WHERE id=${s0}`
    return new Response(null, { status: 204, headers: cors(req.headers.get('Origin')) })
  }

  // POST /listings/:id/publish — mark as PENDING (no real API)
  if (m === 'POST' && s0 && s1 === 'publish') {
    const [listing] = await d`SELECT * FROM "Listing" WHERE id=${s0} AND "userId"=${userId}`
    if (!listing) return E('Wystawienie nie znalezione', 404, req)
    const now = new Date()
    await d`UPDATE "Listing" SET status='PENDING',"updatedAt"=${now} WHERE id=${s0}`
    await d`INSERT INTO "ListingHistory" (id,"listingId",status,message,"createdAt") VALUES (${uid()},${s0},'PENDING','Oczekuje na wystawienie',${now})`
    return R({ id: s0, status: 'PENDING' }, 200, req)
  }

  // POST /listings/publish-all
  if (m === 'POST' && s0 === 'publish-all') {
    const body = await req.json()
    const listings = await d`SELECT id FROM "Listing" WHERE "userId"=${userId} AND status=ANY(ARRAY['PENDING','DRAFT','ERROR']::text[]) ${body.portal?d`AND portal=${body.portal}`:d``}`
    if (!listings.length) return R({ results: [], message: 'Brak wystawień do opublikowania' }, 200, req)
    return R({ results: listings.map((l: any) => ({ id: l.id, status: 'PENDING' })) }, 200, req)
  }

  return E('Not found', 404, req)
}

// ─── IMAGES ───────────────────────────────────────────────────────────────────

async function handleImages(req: Request, s: string[]): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1, s2] = s

  // POST /images/upload/:partId
  if (m === 'POST' && s0 === 'upload' && s1) {
    const partId = s1
    const [part] = await d`SELECT * FROM "Part" WHERE id=${partId} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)

    const form = await req.formData()
    const files = form.getAll('images')
    if (!files.length) return E('Brak plików', 400, req)

    const [maxOrderRow] = await d`SELECT COALESCE(MAX("order"),-1) mo FROM "PartImage" WHERE "partId"=${partId}`
    let order = +maxOrderRow.mo + 1
    const created: unknown[] = []

    for (const file of files) {
      if (!(file instanceof File)) continue
      const allowed = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowed.includes(file.type)) continue
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${partId}/${uid()}.${ext}`
      const bytes = await file.arrayBuffer()
      const { error } = await sb.storage.from('part-images').upload(path, bytes, { contentType: file.type, upsert: false })
      if (error) continue
      const { data: urlData } = sb.storage.from('part-images').getPublicUrl(path)
      const id = uid(), now = new Date()
      await d`INSERT INTO "PartImage" (id,"partId",filename,url,"order","isCover","createdAt") VALUES (${id},${partId},${path},${urlData.publicUrl},${order},${order===0},${now})`
      const [img] = await d`SELECT * FROM "PartImage" WHERE id=${id}`
      created.push(img)
      order++
    }
    return R(created, 201, req)
  }

  // PATCH /images/reorder
  if (m === 'PATCH' && s0 === 'reorder') {
    const { partId, order: imgOrder } = await req.json()
    const [part] = await d`SELECT id FROM "Part" WHERE id=${partId} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    for (let i = 0; i < imgOrder.length; i++) {
      await d`UPDATE "PartImage" SET "order"=${i},"isCover"=${i===0} WHERE id=${imgOrder[i]}`
    }
    const imgs = await d`SELECT * FROM "PartImage" WHERE "partId"=${partId} ORDER BY "order" ASC`
    return R(imgs, 200, req)
  }

  // DELETE /images/:id
  if (m === 'DELETE' && s0 && s0 !== 'upload' && s0 !== 'reorder') {
    const [img] = await d`SELECT * FROM "PartImage" WHERE id=${s0}`
    if (!img) return E('Zdjęcie nie znalezione', 404, req)
    const [part] = await d`SELECT id FROM "Part" WHERE id=${img.partId} AND "userId"=${userId}`
    if (!part) return E('Brak dostępu', 403, req)
    await sb.storage.from('part-images').remove([img.filename])
    await d`DELETE FROM "PartImage" WHERE id=${s0}`
    return new Response(null, { status: 204, headers: cors(req.headers.get('Origin')) })
  }

  return E('Not found', 404, req)
}

// ─── COMPATIBILITY ────────────────────────────────────────────────────────────

async function handleCompatibility(req: Request, s: string[]): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  if (m === 'GET' && s0 && !s1) {
    const [part] = await d`SELECT id FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const items = await d`SELECT * FROM "Compatibility" WHERE "partId"=${s0} ORDER BY brand,model`
    return R(items, 200, req)
  }

  if (m === 'POST' && s0 && s1 === 'bulk') {
    const [part] = await d`SELECT id FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const items = await req.json()
    const created = []
    for (const item of items) {
      const id = uid()
      await d`INSERT INTO "Compatibility" (id,"partId",brand,series,model,"yearFrom","yearTo","engineCode","vinRange","tecdocId",notes) VALUES (${id},${s0},${item.brand},${item.series??null},${item.model??null},${item.yearFrom??null},${item.yearTo??null},${item.engineCode??null},${item.vinRange??null},${item.tecdocId??null},${item.notes??null})`
      const [c] = await d`SELECT * FROM "Compatibility" WHERE id=${id}`
      created.push(c)
    }
    return R(created, 201, req)
  }

  if (m === 'POST' && s0 && !s1) {
    const [part] = await d`SELECT id FROM "Part" WHERE id=${s0} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const body = await req.json()
    const id = uid()
    await d`INSERT INTO "Compatibility" (id,"partId",brand,series,model,"yearFrom","yearTo","engineCode","vinRange","tecdocId",notes) VALUES (${id},${s0},${body.brand},${body.series??null},${body.model??null},${body.yearFrom??null},${body.yearTo??null},${body.engineCode??null},${body.vinRange??null},${body.tecdocId??null},${body.notes??null})`
    const [c] = await d`SELECT * FROM "Compatibility" WHERE id=${id}`
    return R(c, 201, req)
  }

  if (m === 'PATCH' && s0) {
    const [item] = await d`SELECT * FROM "Compatibility" WHERE id=${s0}`
    if (!item) return E('Wpis nie znaleziony', 404, req)
    const [part] = await d`SELECT id FROM "Part" WHERE id=${item.partId} AND "userId"=${userId}`
    if (!part) return E('Brak dostępu', 403, req)
    const body = await req.json()
    const fields: Record<string, unknown> = {}
    for (const k of ['brand','series','model','yearFrom','yearTo','engineCode','vinRange','tecdocId','notes']) {
      if (k in body) fields[k] = body[k]
    }
    if (Object.keys(fields).length) await d`UPDATE "Compatibility" SET ${d(fields)} WHERE id=${s0}`
    const [updated] = await d`SELECT * FROM "Compatibility" WHERE id=${s0}`
    return R(updated, 200, req)
  }

  if (m === 'DELETE' && s0) {
    const [item] = await d`SELECT * FROM "Compatibility" WHERE id=${s0}`
    if (!item) return E('Wpis nie znaleziony', 404, req)
    const [part] = await d`SELECT id FROM "Part" WHERE id=${item.partId} AND "userId"=${userId}`
    if (!part) return E('Brak dostępu', 403, req)
    await d`DELETE FROM "Compatibility" WHERE id=${s0}`
    return new Response(null, { status: 204, headers: cors(req.headers.get('Origin')) })
  }

  return E('Not found', 404, req)
}

// ─── SYNC ────────────────────────────────────────────────────────────────────

const TP_URL = Deno.env.get('SUPABASE_URL')!
const TP_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const tpSb   = createClient(TP_URL, TP_KEY, { auth: { persistSession: false } })

function mapTpStatus(status: string): { stock: number; isActive: boolean } {
  if (status === 'dostępna') return { stock: 1, isActive: true }
  if (status === 'zarezerwowana') return { stock: 0, isActive: true }
  return { stock: 0, isActive: false }
}

function resolvePhotoUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${TP_URL}/storage/v1/object/public/photos/${path}`
}

async function fetchAllTp(table: string, select: string): Promise<unknown[]> {
  const result: unknown[] = []
  let offset = 0
  while (true) {
    const { data, error } = await tpSb.from(table).select(select).range(offset, offset + 999)
    if (error || !data?.length) break
    result.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return result
}

async function runSync(userId: string, triggeredBy: string): Promise<string> {
  const d = db()
  const now = new Date()
  const logId = uid()
  await d`INSERT INTO "SyncLog" (id,"createdAt",status,source,"triggeredBy","totalFetched",created,updated,deactivated,errors) VALUES (${logId},${now},'RUNNING','truckparts',${triggeredBy},0,0,0,0,0)`

  const stats = { totalFetched: 0, created: 0, updated: 0, deactivated: 0, errors: 0, errorDetails: [] as string[] }

  try {
    const vehicleSelect = 'brand,model,year,vin,registration_number'
    const [parts, engines, gearboxes] = await Promise.all([
      fetchAllTp('parts', `*,vehicles!vehicle_id(${vehicleSelect})`),
      fetchAllTp('engines', `*,vehicles!vehicle_id(${vehicleSelect})`),
      fetchAllTp('gearboxes', `*,vehicles!vehicle_id(${vehicleSelect})`),
    ]) as [any[], any[], any[]]

    stats.totalFetched = parts.length + engines.length + gearboxes.length

    // Pre-fetch all existing synced parts for this user
    const existing = await d`SELECT id,"externalId" FROM "Part" WHERE "externalSource"='truckparts' AND "userId"=${userId}`
    const existMap = new Map(existing.map((r: any) => [r.externalId, r.id]))

    const syncedIds = new Set<string>()

    const normalCat: Record<string, string> = {
      'Inne':'inne','Silnik':'silnik','Skrzynia':'skrzynia','Zawieszenie':'zawieszenie',
      'Elektryka':'elektryka','Hamulce':'hamulce','Karoseria':'nadwozie','Kabina':'nadwozie',
      'Chłodnica':'silnik','Oś':'zawieszenie',
    }

    async function upsert(externalId: string, data: Record<string, unknown>, photos: string[], vehicle: any) {
      const existingId = existMap.get(externalId)
      let partId: string
      if (existingId) {
        await d`UPDATE "Part" SET ${d({ ...data, updatedAt: new Date() })} WHERE id=${existingId}`
        partId = existingId
        stats.updated++
      } else {
        partId = uid()
        const now2 = new Date()
        await d`INSERT INTO "Part" ${d({ id: partId, createdAt: now2, updatedAt: now2, ...data })}`
        existMap.set(externalId, partId)
        stats.created++
      }
      // Sync photos (only if any)
      if (photos.length > 0) {
        await d`DELETE FROM "PartImage" WHERE "partId"=${partId}`
        for (let i = 0; i < photos.length; i++) {
          await d`INSERT INTO "PartImage" (id,"partId",filename,url,"order","isCover","createdAt") VALUES (${uid()},${partId},${photos[i].split('/').pop()??`p${i}`},${resolvePhotoUrl(photos[i])},${i},${i===0},${new Date()})`
        }
      }
      // Compat (only if no existing)
      if (vehicle) {
        const [ce] = await d`SELECT id FROM "Compatibility" WHERE "partId"=${partId} LIMIT 1`
        if (!ce) await d`INSERT INTO "Compatibility" (id,"partId",brand,model,"yearFrom","yearTo","vinRange") VALUES (${uid()},${partId},${vehicle.brand},${vehicle.model??null},${vehicle.year??null},${vehicle.year??null},${vehicle.vin??null})`
      }
    }

    for (const item of parts) {
      const externalId = `tp:part:${item.id}`
      syncedIds.add(externalId)
      try {
        const { stock, isActive } = mapTpStatus(item.status)
        const price = Number(item.price ?? 0)
        await upsert(externalId, {
          name: item.name, oemNumber: item.oem||null, category: normalCat[item.category??'']??'inne',
          condition: 'USED', priceNet: price, priceBrutto: Math.round(price*1.23*100)/100, vatRate: 23,
          stock, isActive, descriptionShort: item.note||null, externalId, externalSource: 'truckparts', userId,
        }, item.photos??[], item.vehicles)
      } catch (e: any) { stats.errors++; stats.errorDetails.push(`part:${item.id} — ${e.message}`) }
    }

    for (const item of engines) {
      const externalId = `tp:engine:${item.id}`
      syncedIds.add(externalId)
      try {
        const { stock, isActive } = mapTpStatus(item.status)
        const price = Number(item.price ?? 0)
        const desc = [item.displacement&&`Pojemność: ${item.displacement}`,item.power&&`Moc: ${item.power} KM`,item.fuel&&`Paliwo: ${item.fuel}`,item.code&&`Kod: ${item.code}`].filter(Boolean).join(' | ')
        await upsert(externalId, {
          name: `Silnik ${item.oem}`, oemNumber: item.oem||null, category: 'silnik',
          condition: 'USED', priceNet: price, priceBrutto: Math.round(price*1.23*100)/100, vatRate: 23,
          stock, isActive, descriptionShort: item.note||null, descriptionLong: desc||null,
          externalId, externalSource: 'truckparts', userId,
        }, item.photos??[], item.vehicles)
      } catch (e: any) { stats.errors++; stats.errorDetails.push(`engine:${item.id} — ${e.message}`) }
    }

    for (const item of gearboxes) {
      const externalId = `tp:gearbox:${item.id}`
      syncedIds.add(externalId)
      try {
        const { stock, isActive } = mapTpStatus(item.status)
        const price = Number(item.price ?? 0)
        const desc = [item.type&&`Typ: ${item.type}`,item.brand&&`Marka: ${item.brand}`,item.retarder&&'Retarder: Tak',item.mileage&&`Przebieg: ${item.mileage}`].filter(Boolean).join(' | ')
        await upsert(externalId, {
          name: `Skrzynia biegów ${item.oem}`, oemNumber: item.oem||null, category: 'skrzynia',
          condition: 'USED', priceNet: price, priceBrutto: Math.round(price*1.23*100)/100, vatRate: 23,
          stock, isActive, descriptionShort: item.note||null, descriptionLong: desc||null,
          externalId, externalSource: 'truckparts', userId,
        }, item.photos??[], item.vehicles)
      } catch (e: any) { stats.errors++; stats.errorDetails.push(`gearbox:${item.id} — ${e.message}`) }
    }

    // Deactivate missing
    const allSyncedIds = Array.from(syncedIds)
    const deactivated = await d.unsafe(
      `UPDATE "Part" SET "isActive"=false,stock=0,"updatedAt"=now() WHERE "externalSource"='truckparts' AND "userId"=$1 AND "isActive"=true AND NOT("externalId"=ANY($2::text[]))`,
      [userId, allSyncedIds]
    )
    stats.deactivated = deactivated.count ?? 0

    const status = stats.errors === 0 ? 'SUCCESS' : 'PARTIAL'
    await d`UPDATE "SyncLog" SET status=${status},"finishedAt"=${new Date()},"totalFetched"=${stats.totalFetched},created=${stats.created},updated=${stats.updated},deactivated=${stats.deactivated},errors=${stats.errors},"errorDetails"=${stats.errorDetails.length?JSON.stringify(stats.errorDetails):null} WHERE id=${logId}`
    getNotifSettings(userId).then(ns => {
      if (!ns?.settings.syncComplete) return
      const emoji = stats.errors === 0 ? '✅' : '⚠️'
      const subject = `${emoji} Synchronizacja zakończona — ${stats.totalFetched} pozycji`
      const html = `<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#6366f1">Synchronizacja z TruckParts</h2><ul style="line-height:2"><li>Pobrano: <strong>${stats.totalFetched}</strong></li><li>Nowe: <strong style="color:#22c55e">+${stats.created}</strong></li><li>Zaktualizowane: <strong style="color:#3b82f6">~${stats.updated}</strong></li><li>Dezaktywowane: <strong>${stats.deactivated}</strong></li>${stats.errors>0?`<li style="color:#ef4444">Błędy: <strong>${stats.errors}</strong></li>`:''}</ul></div>`
      return sendEmail(ns.email, subject, html)
    }).catch(e => console.error('notify sync', e))
    return logId
  } catch (e: any) {
    await d`UPDATE "SyncLog" SET status='ERROR',"finishedAt"=${new Date()},"errorDetails"=${JSON.stringify([e.message])} WHERE id=${logId}`
    throw e
  }
}

async function handleSync(req: Request, s: string[]): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0] = s

  if (m === 'POST' && s0 === 'run') {
    const logId = await runSync(userId, 'MANUAL')
    const [log] = await d`SELECT * FROM "SyncLog" WHERE id=${logId}`
    return R(log, 200, req)
  }

  if (m === 'GET' && s0 === 'status') {
    const [log] = await d`SELECT * FROM "SyncLog" ORDER BY "createdAt" DESC LIMIT 1`
    return R(log ?? null, 200, req)
  }

  if (m === 'GET' && s0 === 'logs') {
    const url = new URL(req.url)
    const page = Math.max(1, +(url.searchParams.get('page')||1))
    const limit = Math.min(50, +(url.searchParams.get('limit')||20))
    const offset = (page-1)*limit
    const [logs, [cnt]] = await Promise.all([
      d`SELECT * FROM "SyncLog" ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`,
      d`SELECT COUNT(*) n FROM "SyncLog"`,
    ])
    return R({ items: logs, pagination: { page, limit, total: +cnt.n, totalPages: Math.ceil(+cnt.n/limit) } }, 200, req)
  }

  return E('Not found', 404, req)
}

// ─── AUTOLINE ─────────────────────────────────────────────────────────────────

const AUTOLINE_CATS: Record<string, string> = {
  hamulce:'Brake system',silnik:'Engine & components',skrzynia:'Gearbox & transmission',
  zawieszenie:'Suspension',elektryka:'Electrical system',nadwozie:'Body parts',
  uklad_kierowniczy:'Steering system',uklad_wydechowy:'Exhaust system',
  klimatyzacja:'Air conditioning',oswietlenie:'Lighting',filtry:'Filters',
  pasy_i_napedy:'Drive belts & chains',inne:'Other parts',
}

const CSV_COLS = ['article_name','price','currency','quantity','country','region','oem_number','catalog_ref','ean','make','model','year_from','year_to','part_type','condition','description','tech_params','images']

function csvEsc(v: string|undefined): string {
  if (!v) return ''
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g,'""')}"`
  return v
}

function genCsv(rows: Record<string, string|undefined>[]): string {
  return [CSV_COLS.join(','), ...rows.map(r => CSV_COLS.map(c => csvEsc(r[c])).join(','))].join('\r\n')
}

function xmlEsc(v: string|undefined): string {
  if (!v) return ''
  return v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function genXml(rows: Record<string, string|undefined>[], title: string): string {
  const SCALAR_COLS = CSV_COLS.filter(c => c !== 'images')
  const items = rows.map(r => {
    const fields = SCALAR_COLS.map(c => r[c] ? `    <${c}>${xmlEsc(r[c])}</${c}>` : '').filter(Boolean)
    if (r.images) {
      const imgTags = r.images.split(',').filter(Boolean).map(u => `      <image>${xmlEsc(u.trim())}</image>`).join('\n')
      fields.push(`    <images>\n${imgTags}\n    </images>`)
    }
    return `  <item>\n${fields.join('\n')}\n  </item>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<autoline_feed>\n  <meta><title>${xmlEsc(title)}</title><generated>${new Date().toISOString()}</generated><count>${rows.length}</count></meta>\n  <items>\n${items}\n  </items>\n</autoline_feed>`
}

function buildRow(part: any, template: any): Record<string, string|undefined> {
  let fm: Record<string, unknown> = {}
  let pc: Record<string, unknown> = {}
  try { fm = JSON.parse(template.fieldMapping) } catch {}
  try { pc = JSON.parse(template.portalConfig) } catch {}
  const compat = part.compatibility?.[0]
  const imgs = (part.images||[]).map((i: any) => i.url).join(',')
  const desc = [part.descriptionShort, part.descriptionLong?.replace(/<[^>]+>/g,' ')].filter(Boolean).join('\n').slice(0,3000)
  return {
    article_name: String(fm.article_name ?? fm.name ?? part.name).slice(0,200),
    price: String(fm.price ?? part.priceNet),
    currency: String(pc.currency ?? 'PLN'),
    quantity: String(part.stock),
    country: String(pc.country ?? 'PL'),
    region: pc.region as string | undefined,
    oem_number: part.oemNumber ?? undefined,
    catalog_ref: part.catalogNumber ?? undefined,
    ean: part.ean ?? undefined,
    make: compat?.brand ?? pc.make as string | undefined,
    model: compat?.model ?? pc.model as string | undefined,
    year_from: compat?.yearFrom ? String(compat.yearFrom) : undefined,
    year_to: compat?.yearTo ? String(compat.yearTo) : undefined,
    part_type: AUTOLINE_CATS[part.category] ?? 'Other parts',
    condition: part.condition === 'NEW' ? 'new' : part.condition === 'REGENERATED' ? 'regenerated' : 'used',
    description: desc || undefined,
    tech_params: (() => {
      if (!part.technicalParams) return undefined
      try {
        const tp = typeof part.technicalParams === 'string' ? JSON.parse(part.technicalParams) : part.technicalParams
        if (tp && typeof tp === 'object' && !Array.isArray(tp)) {
          return Object.entries(tp).map(([k, v]) => `${k}: ${v}`).join(' | ').slice(0, 500) || undefined
        }
        return String(tp).slice(0, 500) || undefined
      } catch { return undefined }
    })(),
    images: imgs || undefined,
  }
}

async function handleAutoline(req: Request, s: string[], url: URL): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  async function getParts(partIds?: string[]) {
    return partIds?.length
      ? await d`SELECT p.*,COALESCE(json_agg(DISTINCT jsonb_build_object('id',i.id,'url',i.url,'order',i."order")) FILTER(WHERE i.id IS NOT NULL),'[]') images,COALESCE(json_agg(DISTINCT jsonb_build_object('brand',c.brand,'model',c.model,'yearFrom',c."yearFrom",'yearTo',c."yearTo")) FILTER(WHERE c.id IS NOT NULL),'[]') compatibility FROM "Part" p LEFT JOIN "PartImage" i ON i."partId"=p.id LEFT JOIN "Compatibility" c ON c."partId"=p.id WHERE p."userId"=${userId} AND p.id=ANY(${partIds}::text[]) AND p.stock>0 GROUP BY p.id ORDER BY p."createdAt" DESC`
      : await d`SELECT p.*,COALESCE(json_agg(DISTINCT jsonb_build_object('id',i.id,'url',i.url,'order',i."order")) FILTER(WHERE i.id IS NOT NULL),'[]') images,COALESCE(json_agg(DISTINCT jsonb_build_object('brand',c.brand,'model',c.model,'yearFrom',c."yearFrom",'yearTo',c."yearTo")) FILTER(WHERE c.id IS NOT NULL),'[]') compatibility FROM "Part" p LEFT JOIN "PartImage" i ON i."partId"=p.id LEFT JOIN "Compatibility" c ON c."partId"=p.id WHERE p."userId"=${userId} AND p.stock>0 GROUP BY p.id ORDER BY p."createdAt" DESC`
  }

  async function getTemplate(templateId?: string) {
    return templateId
      ? (await d`SELECT * FROM "Template" WHERE id=${templateId} AND "userId"=${userId}`)[0]
      : (await d`SELECT * FROM "Template" WHERE "userId"=${userId} AND portal='AUTOLINE' AND "isDefault"=true AND "isActive"=true LIMIT 1`)[0]
  }

  if ((m === 'GET' || m === 'POST') && s0 === 'preview') {
    const body = m === 'POST' ? await req.json() : {}
    const partIds = m === 'GET' ? url.searchParams.get('partIds')?.split(',').filter(Boolean) : body.partIds
    const parts = await getParts(partIds)
    const template = await getTemplate(body.templateId)
    if (!template) return E('Brak domyślnego szablonu Autoline', 404, req)
    const rows = parts.map((p: any) => buildRow(p, template))
    return R({ rows, total: rows.length, templateName: template.name }, 200, req)
  }

  if ((m === 'GET' || m === 'POST') && s0 === 'export' && s1 === 'csv') {
    const body = m === 'POST' ? await req.json() : {}
    const partIds = m === 'GET' ? url.searchParams.get('partIds')?.split(',').filter(Boolean) : body.partIds
    const parts = await getParts(partIds)
    const template = await getTemplate(body.templateId || url.searchParams.get('templateId') || undefined)
    if (!template) return E('Brak szablonu Autoline', 404, req)
    if (!parts.length) return E('Brak części do eksportu', 400, req)
    const rows = parts.map((p: any) => buildRow(p, template))
    return rawFile(genCsv(rows), 'text/csv', `autoline_${new Date().toISOString().slice(0,10)}.csv`, req)
  }

  if (m === 'POST' && s0 === 'export' && s1 === 'xml') {
    const body = await req.json()
    const parts = await getParts(body.partIds)
    const template = await getTemplate(body.templateId)
    if (!template) return E('Brak szablonu Autoline', 404, req)
    if (!parts.length) return E('Brak części do eksportu', 400, req)
    const rows = parts.map((p: any) => buildRow(p, template))
    return rawFile(genXml(rows, body.feedTitle ?? 'Mini Baselinker Export'), 'application/xml', `autoline_${new Date().toISOString().slice(0,10)}.xml`, req)
  }

  if (m === 'POST' && s0 === 'mark-exported') {
    const { partIds, templateId } = await req.json()
    const template = await getTemplate(templateId)
    if (!template) return E('Brak szablonu Autoline', 404, req)
    let ok = 0, fail = 0
    for (const partId of partIds) {
      try {
        const now = new Date(), id = uid()
        await d.unsafe(
          `INSERT INTO "Listing" (id,"partId","templateId","userId",portal,status,"createdAt","updatedAt","listedAt","externalData") VALUES ($1,$2,$3,$4,'AUTOLINE','ACTIVE',$5,$5,$5,$6) ON CONFLICT ("partId","templateId") DO UPDATE SET status='ACTIVE',"listedAt"=$5,"updatedAt"=$5,"errorMessage"=NULL`,
          [id, partId, template.id, userId, now, JSON.stringify({ method: 'file_export' })]
        )
        const [listing] = await d`SELECT id FROM "Listing" WHERE "partId"=${partId} AND "templateId"=${template.id}`
        await d`INSERT INTO "ListingHistory" (id,"listingId",status,message,"createdAt") VALUES (${uid()},${listing.id},'ACTIVE','Wyeksportowano do pliku Autoline',${now})`
        ok++
      } catch { fail++ }
    }
    return R({ ok, fail, total: partIds.length }, 200, req)
  }

  if (m === 'GET' && s0 === 'stats') {
    const [total, active, error, stock] = await Promise.all([
      d`SELECT COUNT(*) n FROM "Listing" WHERE "userId"=${userId} AND portal='AUTOLINE'`,
      d`SELECT COUNT(*) n FROM "Listing" WHERE "userId"=${userId} AND portal='AUTOLINE' AND status='ACTIVE'`,
      d`SELECT COUNT(*) n FROM "Listing" WHERE "userId"=${userId} AND portal='AUTOLINE' AND status='ERROR'`,
      d`SELECT COUNT(*) n FROM "Part" WHERE "userId"=${userId} AND stock>0`,
    ])
    return R({ total: +total[0].n, active: +active[0].n, error: +error[0].n, partsInStock: +stock[0].n }, 200, req)
  }

  return E('Not found', 404, req)
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

function detectSep(line: string): string {
  const c = {',': (line.match(/,/g)||[]).length, ';': (line.match(/;/g)||[]).length, '\t': (line.match(/\t/g)||[]).length}
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]
}

function parseLine(line: string, sep: string): string[] {
  const res: string[] = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++ } else inQ=!inQ }
    else if (ch === sep && !inQ) { res.push(cur.trim()); cur='' }
    else cur += ch
  }
  res.push(cur.trim()); return res
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n')
  const lines = clean.split('\n').filter(l=>l.trim())
  if (!lines.length) return { headers:[], rows:[] }
  const sep = detectSep(lines[0])
  const headers = parseLine(lines[0], sep)
  const rows: Record<string,string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i], sep)
    if (vals.every(v=>!v.trim())) continue
    const row: Record<string,string> = {}
    headers.forEach((h,idx) => row[h] = vals[idx]??'')
    rows.push(row)
  }
  return { headers, rows }
}

const COL_MAP: Record<string,string> = {
  nazwa:'name',name:'name','part name':'name','nazwa części':'name',
  oem:'oemNumber','oem number':'oemNumber','numer oem':'oemNumber','oem number':'oemNumber',oemnumber:'oemNumber',
  'catalog number':'catalogNumber','nr kat':'catalogNumber','nr katalogowy':'catalogNumber','catalog ref':'catalogNumber',
  ean:'ean',gtin:'ean',barcode:'ean','kod ean':'ean',
  category:'category',kategoria:'category',
  condition:'condition',stan:'condition',
  price:'priceNet','price net':'priceNet',cena:'priceNet','cena netto':'priceNet','price netto':'priceNet',
  'price brutto':'priceBrutto','cena brutto':'priceBrutto','gross price':'priceBrutto',
  vat:'vatRate','vat rate':'vatRate','stawka vat':'vatRate',
  stock:'stock',qty:'stock',quantity:'stock',ilość:'stock','stan magazynowy':'stock',
  description:'descriptionShort',opis:'descriptionShort',
  'long description':'descriptionLong','opis pelny':'descriptionLong',
  brand:'brand',marka:'brand',make:'brand',model:'model',
  'year from':'yearFrom','rok od':'yearFrom','year to':'yearTo','rok do':'yearTo',
}

function normalizeHeader(h: string): string { return h.toLowerCase().trim().replace(/[_\-]+/g,' ') }

function buildColMap(headers: string[]): Record<string,string> {
  const map: Record<string,string> = {}
  for (const h of headers) {
    const norm = normalizeHeader(h)
    const field = COL_MAP[norm] ?? COL_MAP[h.toLowerCase().trim()]
    if (field) map[h] = field
  }
  return map
}

const condMap: Record<string,string> = {nowa:'NEW',new:'NEW',n:'NEW',regenerowana:'REGENERATED',regenerated:'REGENERATED',regen:'REGENERATED',uzywana:'USED',używana:'USED',used:'USED',u:'USED'}
const catMap: Record<string,string> = {brake:'hamulce',brakes:'hamulce',hamulce:'hamulce',engine:'silnik',silnik:'silnik',gearbox:'skrzynia',transmission:'skrzynia',skrzynia:'skrzynia',suspension:'zawieszenie',zawieszenie:'zawieszenie',electrical:'elektryka',elektryka:'elektryka',body:'nadwozie',nadwozie:'nadwozie',other:'inne',inne:'inne'}

const rowSchema = z.object({
  name: z.string().min(3).max(200),
  oemNumber: z.string().max(100).optional().nullable(),
  catalogNumber: z.string().max(100).optional().nullable(),
  ean: z.string().max(20).optional().nullable(),
  category: z.enum(['hamulce','silnik','skrzynia','zawieszenie','elektryka','nadwozie','uklad_kierowniczy','uklad_wydechowy','klimatyzacja','oswietlenie','filtry','pasy_i_napedy','inne']).default('inne'),
  condition: z.enum(['NEW','REGENERATED','USED']).default('NEW'),
  priceNet: z.coerce.number().positive(),
  priceBrutto: z.coerce.number().positive().optional(),
  vatRate: z.coerce.number().default(23),
  stock: z.coerce.number().int().min(0).default(0),
  stockMin: z.coerce.number().int().min(0).default(1),
  descriptionShort: z.string().max(500).optional().nullable(),
  brand: z.string().max(50).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  yearFrom: z.coerce.number().int().optional().nullable(),
  yearTo: z.coerce.number().int().optional().nullable(),
})

function processImport(rows: Record<string,string>[], headers: string[]) {
  const colMap = buildColMap(headers)
  const valid: { rowIndex: number; parsed: unknown }[] = []
  const invalid: { rowIndex: number; raw: unknown; errors: string[] }[] = []
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const mapped: Record<string,unknown> = {}
    for (const [col, val] of Object.entries(raw)) {
      const field = colMap[col]
      if (field) mapped[field] = val.trim()
    }
    if (mapped.condition) mapped.condition = condMap[String(mapped.condition).toLowerCase().trim()] ?? String(mapped.condition).toUpperCase()
    if (mapped.category)  mapped.category  = catMap[String(mapped.category).toLowerCase().trim()] ?? 'inne'
    if (mapped.priceNet && !mapped.priceBrutto) {
      const net = Number(mapped.priceNet), vat = Number(mapped.vatRate ?? 23)
      if (!isNaN(net)) mapped.priceBrutto = Math.round(net*(1+vat/100)*100)/100
    }
    const result = rowSchema.safeParse(mapped)
    if (result.success) valid.push({ rowIndex: i+2, parsed: result.data })
    else invalid.push({ rowIndex: i+2, raw, errors: result.error.issues.map(e=>e.message) })
  }
  return { valid, invalid, total: rows.length }
}

async function handleImport(req: Request, s: string[]): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  if (m === 'GET' && s0 === 'template' && s1 === 'csv') {
    const header = 'name,oemNumber,catalogNumber,ean,category,condition,priceNet,priceBrutto,vatRate,stock,stockMin,descriptionShort,brand,model,yearFrom,yearTo'
    const example = '"Tarcza hamulcowa MAN TGX",81508030068,THM-001,5901234123457,hamulce,NEW,350.00,430.50,23,5,1,"Tarcza hamulcowa osi przedniej",MAN,TGX 18.400,2007,2020'
    return rawFile(`${header}\r\n${example}\r\n`, 'text/csv', 'mini_baselinker_import_template.csv', req)
  }

  if (m === 'POST' && (s0 === 'preview' || s0 === 'execute')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return E('Brak pliku', 400, req)
    const text = new TextDecoder().decode(await file.arrayBuffer())
    const { headers, rows } = parseCsv(text)
    if (!headers.length) return E('Brak nagłówków', 400, req)

    const limitedRows = rows.slice(0, 500)
    const result = processImport(limitedRows, headers)

    if (s0 === 'preview') {
      return R({
        headers, columnMap: buildColMap(headers),
        valid: result.valid.length, invalid: result.invalid.length, total: result.total,
        previewValid: result.valid.slice(0,20), previewInvalid: result.invalid.slice(0,20),
        truncated: rows.length > 500, totalInFile: rows.length,
      }, 200, req)
    }

    // execute
    const dryRun = form.get('dryRun') === 'true'
    const skipInvalid = form.get('skipInvalid') !== 'false'
    const updateExisting = form.get('updateExisting') === 'true'

    if (dryRun) return R({ dryRun: true, wouldCreate: result.valid.length, invalid: result.invalid.length }, 200, req)

    let created = 0, updated = 0, skipped = 0
    const errors: unknown[] = []
    for (const item of result.valid) {
      const data = item.parsed as any
      const { brand, model, yearFrom, yearTo, ...partData } = data
      try {
        let part = null
        if (updateExisting && data.oemNumber) {
          const [ex] = await d`SELECT id FROM "Part" WHERE "oemNumber"=${data.oemNumber} AND "userId"=${userId} LIMIT 1`
          part = ex
        }
        if (part && updateExisting) {
          await d`UPDATE "Part" SET ${d({ ...partData, updatedAt: new Date() })} WHERE id=${part.id}`
          updated++
        } else if (!part) {
          const id = uid(), now = new Date()
          await d`INSERT INTO "Part" ${d({ id, userId, createdAt: now, updatedAt: now, isActive: true, externalId: null, externalSource: null, technicalParams: null, ...partData })}`
          if (brand) await d`INSERT INTO "Compatibility" (id,"partId",brand,model,"yearFrom","yearTo") VALUES (${uid()},${id},${brand},${model??null},${yearFrom??null},${yearTo??null})`
          created++
        } else { skipped++ }
      } catch (e: any) { errors.push({ row: item.rowIndex, error: e.message }) }
    }
    return R({ created, updated, skipped, invalid: result.invalid.length, errors: errors.slice(0,50), total: result.total }, 200, req)
  }

  return E('Not found', 404, req)
}

// ─── PUBLISH ──────────────────────────────────────────────────────────────────

async function handlePublish(req: Request, s: string[], url: URL): Promise<Response> {
  const { userId } = await auth(req)
  const d = db()
  const m = req.method
  const [s0, s1] = s

  // GET /publish/status — dashboard portal strip
  if (m === 'GET' && s0 === 'status') {
    const listingStats = await d`SELECT portal,status,COUNT(*) cnt FROM "Listing" WHERE "userId"=${userId} GROUP BY portal,status`
    const byPortal: Record<string, Record<string, number>> = {}
    for (const r of listingStats) {
      if (!byPortal[r.portal]) byPortal[r.portal] = {}
      byPortal[r.portal][r.status] = +r.cnt
    }
    const [stock] = await d`SELECT COUNT(*) n FROM "Part" WHERE "userId"=${userId} AND stock>0`
    return R({
      portals: {
        ALLEGRO: { connected: false, stats: byPortal['ALLEGRO'] ?? {} },
        OTOMOTO: { connected: false, stats: byPortal['OTOMOTO'] ?? {} },
        AUTOLINE: { connected: true, stats: byPortal['AUTOLINE'] ?? {} },
      },
      partsInStock: +stock.n, sseConnections: 0,
    }, 200, req)
  }

  // POST /publish/start
  if (m === 'POST' && s0 === 'start') {
    const body = await req.json()
    const [part] = await d`SELECT id FROM "Part" WHERE id=${body.partId} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const jobId = uid()
    return R({ jobId, partId: body.partId, portals: body.portals ?? [], message: 'Wystawienie PENDING — brak połączenia z portalem' }, 200, req)
  }

  // GET /publish/stream/:jobId — SSE not supported, return immediately
  if (m === 'GET' && s0 === 'stream') {
    return R({ type: 'job_done', message: 'SSE niedostępne w Edge Functions' }, 200, req)
  }

  // GET /publish/job/:jobId
  if (m === 'GET' && s0 === 'job') {
    return R({ jobId: s1, status: 'done', results: [] }, 200, req)
  }

  // POST /publish/part/:partId
  if (m === 'POST' && s0 === 'part' && s1) {
    const [part] = await d`SELECT id FROM "Part" WHERE id=${s1} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    return R({ jobId: uid(), results: [] }, 200, req)
  }

  // GET /publish/history/:partId
  if (m === 'GET' && s0 === 'history' && s1) {
    const [part] = await d`SELECT id FROM "Part" WHERE id=${s1} AND "userId"=${userId}`
    if (!part) return E('Część nie znaleziona', 404, req)
    const listings = await d`SELECT l.*,t.id tid,t.name tname,t.portal tportal FROM "Listing" l JOIN "Template" t ON t.id=l."templateId" WHERE l."partId"=${s1} ORDER BY l."updatedAt" DESC`
    return R(listings.map((l: any) => ({ ...l, template: { id: l.tid, name: l.tname, portal: l.tportal } })), 200, req)
  }

  return E('Not found', 404, req)
}

// ─── ALLEGRO / OTOMOTO stubs ─────────────────────────────────────────────────

async function handleAllegro(req: Request): Promise<Response> {
  return R({ connected: false, authUrl: null, message: 'Allegro wymaga konfiguracji OAuth' }, 200, req)
}

async function handleOtomoto(req: Request): Promise<Response> {
  return R({ connected: false, authUrl: null, message: 'Otomoto wymaga konfiguracji OAuth' }, 200, req)
}

// ─── Main Router ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) })
  }

  const s = segs(req)
  const group = s[0] ?? ''
  const sub = s.slice(1)
  const url = new URL(req.url)

  try {
    if (group === 'health') return R({ status: 'ok', timestamp: new Date().toISOString() }, 200, req)
    if (group === 'auth')          return await handleAuth(req, sub)
    if (group === 'parts')         return await handleParts(req, sub, url)
    if (group === 'templates')     return await handleTemplates(req, sub, url)
    if (group === 'listings')      return await handleListings(req, sub, url)
    if (group === 'images')        return await handleImages(req, sub)
    if (group === 'compatibility') return await handleCompatibility(req, sub)
    if (group === 'sync')          return await handleSync(req, sub)
    if (group === 'autoline')      return await handleAutoline(req, sub, url)
    if (group === 'import')        return await handleImport(req, sub)
    if (group === 'publish')       return await handlePublish(req, sub, url)
    if (group === 'allegro')       return await handleAllegro(req)
    if (group === 'otomoto')       return await handleOtomoto(req)
    return E('Not found', 404, req)
  } catch (e: any) {
    const status = e?.status ?? 500
    const msg = status < 500 ? e.message : 'Błąd serwera'
    console.error('Edge Function error:', e)
    return E(msg, status, req)
  }
})
