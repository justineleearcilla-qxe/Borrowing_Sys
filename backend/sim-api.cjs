/* Comprehensive backend API simulation for EquipHub.
 * Runs against a live server at http://localhost:4000/api.
 * Creates its own test item + users and cleans everything up at the end.
 * Run: node sim-api.cjs
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const BASE = 'http://localhost:4000/api'
const PW = 'Password123!'
const STAMP = Date.now()
const STU = `sim.student.${STAMP}@school.edu`
const FAC = `sim.faculty.${STAMP}@school.edu`
const TEST_ITEM_NAME = `SimTestWidget${STAMP}`

const results = []
let section = 'init'
const S = (s) => { section = s }

function ok(name, cond, detail = '') {
  results.push({ section, name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'} | [${section}] ${name}${cond ? '' : '  -> ' + detail}`)
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function has(name, hay, needle) {
  ok(name, typeof hay === 'string' && hay.includes(needle), `expected ${JSON.stringify(needle)} in ${JSON.stringify(hay)}`)
}

async function req(method, path, { token, body, form, rawBody, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } }
  if (token) opts.headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  if (form) opts.body = form
  else if (rawBody !== undefined) { opts.body = rawBody; opts.headers['Content-Type'] = 'application/json' }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json' }
  const res = await fetch(BASE + path, opts)
  const ct = res.headers.get('content-type') || ''
  let data = null, buf = null
  if (ct.includes('application/json')) { try { data = await res.json() } catch { data = null } }
  else buf = Buffer.from(await res.arrayBuffer())
  return { status: res.status, data, buf, ct }
}

const pad = (n) => String(n).padStart(2, '0')
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dstr = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return isoDay(d) }

let admin = null, stu = null, fac = null
let stuId = null, facId = null
let itemsByCode = {}
let testItemId = null

async function main() {
  // ================= INFRA =================
  S('infra')
  {
    const r = await req('GET', '/health')
    eq('GET /health -> 200', r.status, 200)
    ok('health body {ok:true}', r.data && r.data.ok === true, JSON.stringify(r.data))
    const nf = await req('GET', '/does-not-exist')
    eq('unknown route -> 404', nf.status, 404)
    const bad = await req('POST', '/auth/login', { rawBody: '{not json' })
    eq('malformed JSON body -> 400', bad.status, 400)
    has('malformed JSON message', bad.data && bad.data.message, 'Invalid JSON')
  }

  // ================= AUTH =================
  S('auth')
  {
    const reg = await req('POST', '/auth/register', {
      body: { name: 'Sim Student', email: STU, password: PW, role: 'STUDENT', department: 'Sim Dept' },
    })
    eq('register new student -> 201', reg.status, 201)
    ok('register returns token + user', !!(reg.data && reg.data.token && reg.data.user && reg.data.user.email === STU))
    ok('register never returns passwordHash', !!(reg.data && reg.data.user && !('passwordHash' in reg.data.user)))
    eq('register default role STUDENT', reg.data && reg.data.user && reg.data.user.role, 'STUDENT')
    stu = reg.data && reg.data.token
    stuId = reg.data && reg.data.user && reg.data.user.id

    const regFac = await req('POST', '/auth/register', {
      body: { name: 'Sim Faculty', email: FAC, password: PW, role: 'FACULTY', department: 'Sim Dept' },
    })
    eq('register faculty -> 201', regFac.status, 201)
    eq('register role FACULTY honored', regFac.data && regFac.data.user && regFac.data.user.role, 'FACULTY')
    fac = regFac.data && regFac.data.token
    facId = regFac.data && regFac.data.user && regFac.data.user.id

    const regAdmin = await req('POST', '/auth/register', {
      body: { name: 'Hacker', email: `sim.admin.${STAMP}@school.edu`, password: PW, role: 'ADMIN' },
    })
    eq('register role ADMIN rejected -> 400', regAdmin.status, 400)

    const dup = await req('POST', '/auth/register', { body: { name: 'Dup', email: STU, password: PW } })
    eq('duplicate email -> 409', dup.status, 409)

    const short = await req('POST', '/auth/register', { body: { name: 'Shorty', email: `sim.short.${STAMP}@school.edu`, password: 'abc' } })
    eq('short password -> 400', short.status, 400)
    has('short password message', short.data && short.data.message, 'at least 8')

    const bademail = await req('POST', '/auth/register', { body: { name: 'Bad Email', email: 'not-an-email', password: PW } })
    eq('invalid email -> 400', bademail.status, 400)

    const ext = await req('POST', '/auth/register', { body: { name: 'External', email: `sim.ext.${STAMP}@gmail.com`, password: PW } })
    eq('non-school register -> 400', ext.status, 400)
    has('non-school register message', ext.data && ext.data.message, '@school.edu')

    const aLogin = await req('POST', '/auth/login', { body: { email: 'admin@school.edu', password: PW } })
    eq('login admin -> 200', aLogin.status, 200)
    eq('admin login role', aLogin.data && aLogin.data.user && aLogin.data.user.role, 'ADMIN')
    admin = aLogin.data && aLogin.data.token

    const sLogin = await req('POST', '/auth/login', { body: { email: STU, password: PW } })
    eq('login student -> 200', sLogin.status, 200)
    const fLogin = await req('POST', '/auth/login', { body: { email: FAC, password: PW } })
    eq('login faculty -> 200', fLogin.status, 200)

    const wrong = await req('POST', '/auth/login', { body: { email: STU, password: 'wrongpass' } })
    eq('wrong password -> 401', wrong.status, 401)
    has('wrong password generic message', wrong.data && wrong.data.message, 'Invalid email or password')

    const unknown = await req('POST', '/auth/login', { body: { email: 'nobody@school.edu', password: PW } })
    eq('unknown user -> 401', unknown.status, 401)
    has('no user enumeration (same message)', unknown.data && unknown.data.message, 'Invalid email or password')

    const extLogin = await req('POST', '/auth/login', { body: { email: 'x@gmail.com', password: PW } })
    eq('login non-school -> 401', extLogin.status, 401)

    const missing = await req('POST', '/auth/login', { body: { email: '' } })
    eq('login missing password -> 400', missing.status, 400)

    const me = await req('GET', '/auth/me', { token: stu })
    eq('GET /auth/me -> 200', me.status, 200)
    eq('me email', me.data && me.data.email, STU)
    const meNo = await req('GET', '/auth/me')
    eq('GET /auth/me no token -> 401', meNo.status, 401)
    const meBad = await req('GET', '/auth/me', { token: 'Bearer not.a.token' })
    eq('GET /auth/me bad token -> 401', meBad.status, 401)
  }

  // ================= CATEGORIES =================
  S('categories')
  {
    const r = await req('GET', '/categories')
    eq('GET /categories -> 200', r.status, 200)
    ok('6 seeded categories', Array.isArray(r.data) && r.data.length === 6, `got ${r.data && r.data.length}`)
    ok('category has itemCount', Array.isArray(r.data) && typeof r.data[0].itemCount === 'number')
  }

  // ================= ITEMS read =================
  S('items-read')
  {
    const all = await req('GET', '/items')
    eq('GET /items -> 200', all.status, 200)
    ok('items list non-empty', Array.isArray(all.data) && all.data.length >= 23, `got ${all.data && all.data.length}`)
    for (const it of all.data || []) itemsByCode[it.code] = it.id
    ok('EQ-5004 (retired) present', !!itemsByCode['EQ-5004'])
    ok('EQ-6004 (maintenance) present', !!itemsByCode['EQ-6004'])
    ok('item includes category', !!(all.data && all.data[0] && all.data[0].category))
    ok('item has nextAvailableDate field', !!(all.data && all.data[0] && 'nextAvailableDate' in all.data[0]))

    const q = await req('GET', '/items?q=guitar')
    ok('search q=guitar returns Acoustic Guitar', Array.isArray(q.data) && q.data.some((i) => i.code === 'EQ-5001'))
    const cat = await req('GET', '/items?categoryId=1')
    ok('categoryId=1 only that category', Array.isArray(cat.data) && cat.data.length > 0 && cat.data.every((i) => i.categoryId === 1))
    const badCat = await req('GET', '/items?categoryId=abc')
    eq('categoryId=abc -> 400 (not 500)', badCat.status, 400)
    const st = await req('GET', '/items?status=AVAILABLE')
    ok('status=AVAILABLE all available', Array.isArray(st.data) && st.data.every((i) => i.status === 'AVAILABLE'))
    const badSt = await req('GET', '/items?status=BOGUS')
    eq('status=BOGUS -> 400', badSt.status, 400)
    const dept = await req('GET', '/items?department=Music')
    ok('department=Music filter', Array.isArray(dept.data) && dept.data.length > 0 && dept.data.every((i) => i.department === 'Music'))
    const avail = await req('GET', '/items?available=true')
    ok('available=true only AVAILABLE qty>0', Array.isArray(avail.data) && avail.data.every((i) => i.status === 'AVAILABLE' && i.availableQuantity > 0))

    const one = await req('GET', `/items/${itemsByCode['EQ-5001']}`)
    eq('GET /items/:id -> 200', one.status, 200)
    eq('item code matches', one.data && one.data.code, 'EQ-5001')
    eq('GET /items/999999 -> 404', (await req('GET', '/items/999999')).status, 404)
    eq('GET /items/abc -> 400', (await req('GET', '/items/abc')).status, 400)

    const qr = await req('GET', `/items/${itemsByCode['EQ-5001']}/qrcode`)
    eq('qrcode -> 200', qr.status, 200)
    ok('qrcode is png', (qr.ct || '').includes('image/png') && qr.buf && qr.buf.slice(1, 4).toString() === 'PNG')
    eq('qrcode 404 missing item', (await req('GET', '/items/999999/qrcode')).status, 404)

    const byCode = await req('GET', '/items/code/EQ-5001', { token: admin })
    eq('GET /items/code/:code as admin -> 200', byCode.status, 200)
    ok('code lookup includes openLoans', !!(byCode.data && Array.isArray(byCode.data.openLoans)))
    eq('GET /items/code as student -> 403', (await req('GET', '/items/code/EQ-5001', { token: stu })).status, 403)
    eq('GET /items/code no token -> 401', (await req('GET', '/items/code/EQ-5001')).status, 401)
    eq('GET /items/code/EQ-9999 -> 404', (await req('GET', '/items/code/EQ-9999', { token: admin })).status, 404)
  }

  // ================= ITEMS admin CRUD =================
  S('items-admin')
  {
    eq('POST /items as student -> 403', (await req('POST', '/items', { token: stu, body: { name: 'Nope', categoryId: 1 } })).status, 403)
    eq('POST /items no token -> 401', (await req('POST', '/items', { body: { name: 'Nope', categoryId: 1 } })).status, 401)
    eq('POST /items bad category -> 400', (await req('POST', '/items', { token: admin, body: { name: 'Bad Cat', categoryId: 9999 } })).status, 400)
    eq('POST /items missing name -> 400', (await req('POST', '/items', { token: admin, body: { categoryId: 1 } })).status, 400)
    eq('POST /items qty too large -> 400', (await req('POST', '/items', { token: admin, body: { name: 'Big', categoryId: 1, totalQuantity: 999999 } })).status, 400)

    const created = await req('POST', '/items', {
      token: admin,
      body: { name: TEST_ITEM_NAME, categoryId: 1, totalQuantity: 3, availableQuantity: 3, condition: 'GOOD', status: 'AVAILABLE', department: 'Sim Dept' },
    })
    eq('POST /items valid -> 201', created.status, 201)
    ok('created item auto code EQ-####', !!(created.data && /^EQ-\d{4}$/.test(created.data.code)), created.data && created.data.code)
    testItemId = created.data && created.data.id

    const upd = await req('PUT', `/items/${testItemId}`, { token: admin, body: { name: TEST_ITEM_NAME, totalQuantity: 5 } })
    eq('PUT /items/:id -> 200', upd.status, 200)
    eq('PUT updated totalQuantity', upd.data && upd.data.totalQuantity, 5)
    eq('PUT missing item -> 404', (await req('PUT', '/items/999999', { token: admin, body: { name: 'x y' } })).status, 404)

    eq('POST image without file -> 400', (await req('POST', `/items/${testItemId}/image`, { token: admin })).status, 400)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    const fd = new FormData()
    fd.append('image', new Blob([png], { type: 'image/png' }), 'sim.png')
    const upOk = await req('POST', `/items/${testItemId}/image`, { token: admin, form: fd })
    eq('POST image valid png -> 200', upOk.status, 200)
    ok('imageUrl set to /uploads/...', !!(upOk.data && upOk.data.imageUrl && upOk.data.imageUrl.startsWith('/uploads/')), upOk.data && upOk.data.imageUrl)
    const fd2 = new FormData()
    fd2.append('image', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'sim.txt')
    eq('POST image non-image -> 400', (await req('POST', `/items/${testItemId}/image`, { token: admin, form: fd2 })).status, 400)
  }

  // ================= LOANS borrower =================
  S('loans-borrower')
  let loanId = null
  {
    eq('POST /loans no token -> 401', (await req('POST', '/loans', { body: {} })).status, 401)
    eq('POST /loans short purpose -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'x', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 400)
    eq('POST /loans qty 0 -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 0, purpose: 'Qty zero test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 400)
    eq('POST /loans itemId abc -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: 'abc', quantity: 1, purpose: 'Bad id test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 400)
    eq('POST /loans unknown item -> 404', (await req('POST', '/loans', { token: stu, body: { itemId: 999999, quantity: 1, purpose: 'Unknown test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 404)
    eq('POST /loans past dateNeeded -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Past date test', dateNeeded: dstr(-3), returnDate: dstr(1) } })).status, 400)
    eq('POST /loans return <= needed -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Range test', dateNeeded: dstr(3), returnDate: dstr(2) } })).status, 400)
    eq('POST /loans retired item -> 409', (await req('POST', '/loans', { token: stu, body: { itemId: itemsByCode['EQ-5004'], quantity: 1, purpose: 'Retired test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 409)
    eq('POST /loans qty 999 (>500 max) -> 400', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 999, purpose: 'Over qty test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 400)
    eq('POST /loans qty 100 (> available 3) -> 409', (await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 100, purpose: 'Over avail test', dateNeeded: dstr(1), returnDate: dstr(3) } })).status, 409)

    const good = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Sim single loan', dateNeeded: dstr(1), returnDate: dstr(3) } })
    eq('POST /loans valid -> 201', good.status, 201)
    eq('created loan PENDING', good.data && good.data.status, 'PENDING')
    loanId = good.data && good.data.id

    const mine = await req('GET', '/loans/mine', { token: stu })
    eq('GET /loans/mine -> 200', mine.status, 200)
    ok('mine contains created loan', Array.isArray(mine.data) && mine.data.some((l) => l.id === loanId))

    eq('GET /loans as student -> 403', (await req('GET', '/loans', { token: stu })).status, 403)
    eq('GET /loans as faculty -> 403 (admin only)', (await req('GET', '/loans', { token: fac })).status, 403)
    const listAdmin = await req('GET', '/loans', { token: admin })
    eq('GET /loans as admin -> 200', listAdmin.status, 200)
    ok('admin loan list has user field', !!(Array.isArray(listAdmin.data) && listAdmin.data[0] && listAdmin.data[0].user))
    const listPending = await req('GET', '/loans?status=PENDING', { token: admin })
    ok('loans?status=PENDING all pending', Array.isArray(listPending.data) && listPending.data.every((l) => l.status === 'PENDING'))
  }

  // ================= LOANS admin flow =================
  S('loans-admin')
  {
    eq('decide as student -> 403', (await req('PATCH', `/loans/${loanId}/decide`, { token: stu, body: { action: 'approve' } })).status, 403)
    eq('decide bad action -> 400', (await req('PATCH', `/loans/${loanId}/decide`, { token: admin, body: { action: 'maybe' } })).status, 400)

    const stockBefore = (await req('GET', `/items/${testItemId}`)).data.availableQuantity
    const approve = await req('PATCH', `/loans/${loanId}/decide`, { token: admin, body: { action: 'approve', remarks: 'Approved by sim' } })
    eq('approve pending loan -> 200', approve.status, 200)
    eq('loan APPROVED', approve.data && approve.data.status, 'APPROVED')
    eq('decide non-pending -> 409', (await req('PATCH', `/loans/${loanId}/decide`, { token: admin, body: { action: 'approve' } })).status, 409)
    eq('return not-borrowed loan -> 409', (await req('PATCH', `/loans/${loanId}/return`, { token: admin, body: {} })).status, 409)

    const co = await req('PATCH', `/loans/${loanId}/checkout`, { token: admin })
    eq('checkout approved loan -> 200', co.status, 200)
    eq('loan BORROWED', co.data && co.data.status, 'BORROWED')
    eq('checkout decrements availableQuantity', (await req('GET', `/items/${testItemId}`)).data.availableQuantity, stockBefore - 1)
    eq('re-checkout -> 409', (await req('PATCH', `/loans/${loanId}/checkout`, { token: admin })).status, 409)

    const ret = await req('PATCH', `/loans/${loanId}/return`, { token: admin, body: { note: 'Returned fine' } })
    eq('return borrowed loan -> 200', ret.status, 200)
    eq('loan RETURNED', ret.data && ret.data.status, 'RETURNED')
    eq('return outcome OK', ret.data && ret.data.outcome, 'OK')
    eq('return restores availableQuantity', (await req('GET', `/items/${testItemId}`)).data.availableQuantity, stockBefore)
    has('return note stored in remarks', ret.data && ret.data.remarks, 'Return note (OK): Returned fine')

    const l2 = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Sim reject loan', dateNeeded: dstr(1), returnDate: dstr(2) } })
    const rej = await req('PATCH', `/loans/${l2.data.id}/decide`, { token: admin, body: { action: 'reject', remarks: 'Not now' } })
    eq('reject loan -> 200', rej.status, 200)
    eq('loan REJECTED', rej.data && rej.data.status, 'REJECTED')

    const l3 = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Sim cancel loan', dateNeeded: dstr(1), returnDate: dstr(2) } })
    const l3id = l2.data && l2.data.id ? l2.data.id : 0
    eq('cancel other user loan -> 404', (await req('DELETE', `/loans/${l2.data.id}`, { token: fac })).status, 404)
    const cancel = await req('DELETE', `/loans/${l3.data.id}`, { token: stu })
    eq('cancel own pending loan -> 200', cancel.status, 200)
    eq('cancelled loan REJECTED', cancel.data && cancel.data.status, 'REJECTED')
    eq('cancel non-pending -> 409', (await req('DELETE', `/loans/${l2.data.id}`, { token: stu })).status, 409)
    eq('cancel missing loan -> 404', (await req('DELETE', '/loans/999999', { token: stu })).status, 404)

    for (const outcome of ['DAMAGED', 'LOST']) {
      const lc = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: `Sim ${outcome} loan`, dateNeeded: dstr(1), returnDate: dstr(2) } })
      const id = lc.data.id
      await req('PATCH', `/loans/${id}/decide`, { token: admin, body: { action: 'approve' } })
      await req('PATCH', `/loans/${id}/checkout`, { token: admin })
      const r = await req('PATCH', `/loans/${id}/return`, { token: admin, body: { outcome } })
      ok(`return outcome ${outcome} honored`, !!(r.data && r.data.outcome === outcome), JSON.stringify(r.data && r.data.outcome))
    }

    eq('maintenance as student -> 403', (await req('POST', '/loans/maintenance/run', { token: stu })).status, 403)
    const sweep = await req('POST', '/loans/maintenance/run', { token: admin })
    eq('maintenance as admin -> 200', sweep.status, 200)
    ok('sweep returns counts', !!(sweep.data && ['flagged', 'reminded', 'expired', 'offersExpired'].every((k) => k in sweep.data)), JSON.stringify(sweep.data))
  }

  // ================= BATCH (cart) =================
  S('loans-batch')
  {
    const valid = await req('POST', '/loans/batch', {
      token: stu,
      body: { purpose: 'Sim cart checkout', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: testItemId, quantity: 1 }, { itemId: itemsByCode['EQ-6002'], quantity: 2 }] },
    })
    eq('POST /loans/batch valid -> 201', valid.status, 201)
    eq('batch count = 2', valid.data && valid.data.count, 2)
    ok('shared batchId on all rows', !!(valid.data && Array.isArray(valid.data.loans) && valid.data.loans.every((l) => l.batchId === valid.data.batchId)))
    const mineAfter = await req('GET', '/loans/mine', { token: stu })
    ok('mine shows batch rows', !!(Array.isArray(mineAfter.data) && mineAfter.data.some((l) => l.batchId === valid.data.batchId)))

    eq('empty cart -> 400', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Empty cart test', dateNeeded: dstr(1), returnDate: dstr(3), items: [] } })).status, 400)
    eq('26 lines -> 400', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Too many test', dateNeeded: dstr(1), returnDate: dstr(3), items: Array.from({ length: 26 }, () => ({ itemId: testItemId, quantity: 1 })) } })).status, 400)
    eq('batch unknown item -> 404', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Unknown test', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: 999999, quantity: 1 }] } })).status, 404)
    eq('batch retired item -> 409', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Retired test', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: itemsByCode['EQ-5004'], quantity: 1 }] } })).status, 409)
    eq('batch over available -> 409', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Over qty test', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: testItemId, quantity: 500 }] } })).status, 409)
    const merged = await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Dedupe merge test', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: testItemId, quantity: 1 }, { itemId: testItemId, quantity: 1 }] } })
    eq('duplicate lines merged -> 1 loan', merged.data && merged.data.count, 1)
    eq('merged quantity = 2', merged.data && merged.data.loans[0].quantity, 2)
  }

  // ================= RESERVATIONS =================
  S('reservations')
  {
    const TOTAL = (await req('GET', `/items/${testItemId}`)).data.totalQuantity
    const good = await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: 1, reservationDate: dstr(10), pickupTime: '09:00', returnDate: dstr(12), purpose: 'Sim reservation' } })
    eq('POST /reservations -> 201', good.status, 201)
    eq('reservation PENDING', good.data && good.data.status, 'PENDING')
    const resId = good.data && good.data.id

    eq('reservation past date -> 400', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(-2), returnDate: dstr(1), purpose: 'Past resv test' } })).status, 400)
    eq('reservation return <= pickup -> 400', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(3), returnDate: dstr(2), purpose: 'Range resv test' } })).status, 400)
    eq('reservation beyond 180d horizon -> 400', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(200), returnDate: dstr(202), purpose: 'Horizon resv test' } })).status, 400)
    eq('reservation short purpose -> 400', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(3), returnDate: dstr(4), purpose: 'x' } })).status, 400)
    eq('reservation bad time -> 400', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(3), pickupTime: '25:99', returnDate: dstr(4), purpose: 'Bad time resv' } })).status, 400)
    eq('reservation unknown item -> 404', (await req('POST', '/reservations', { token: stu, body: { itemId: 999999, reservationDate: dstr(3), returnDate: dstr(4), purpose: 'Unknown resv test' } })).status, 404)
    eq('reservation retired item -> 409', (await req('POST', '/reservations', { token: stu, body: { itemId: itemsByCode['EQ-5004'], reservationDate: dstr(3), returnDate: dstr(4), purpose: 'Retired resv test' } })).status, 409)
    eq('reservation qty > total -> 409', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: TOTAL + 1, reservationDate: dstr(20), returnDate: dstr(21), purpose: 'Over qty resv test' } })).status, 409)

    const fill = await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: TOTAL, reservationDate: dstr(15), returnDate: dstr(17), purpose: 'Conflict fill resv' } })
    eq('fill window reservation -> 201', fill.status, 201)
    const conflict = await req('POST', '/reservations', { token: fac, body: { itemId: testItemId, quantity: 1, reservationDate: dstr(16), returnDate: dstr(18), purpose: 'Conflict resv test' } })
    eq('overlapping reservation -> 409', conflict.status, 409)
    has('conflict message offers next available date', conflict.data && conflict.data.message, 'Next available date')
    // release the fill window again
    await req('PATCH', `/reservations/${fill.data.id}/cancel`, { token: stu })

    const mine = await req('GET', '/reservations/mine', { token: stu })
    eq('GET /reservations/mine -> 200', mine.status, 200)
    ok('mine contains created reservation', Array.isArray(mine.data) && mine.data.some((r) => r.id === resId))
    eq('GET /reservations as student -> 403', (await req('GET', '/reservations', { token: stu })).status, 403)
    eq('GET /reservations as faculty (staff) -> 200', (await req('GET', '/reservations', { token: fac })).status, 200)
    const listAdmin = await req('GET', '/reservations', { token: admin })
    eq('GET /reservations as admin -> 200', listAdmin.status, 200)
    ok('staff reservation list includes user', !!(listAdmin.data && listAdmin.data[0] && listAdmin.data[0].user))

    eq('cancel other user reservation -> 404', (await req('PATCH', `/reservations/${resId}/cancel`, { token: fac })).status, 404)
    const cancel = await req('PATCH', `/reservations/${resId}/cancel`, { token: stu })
    eq('cancel own pending reservation -> 200', cancel.status, 200)
    eq('reservation CANCELLED', cancel.data && cancel.data.status, 'CANCELLED')
    eq('cancel non-pending -> 409', (await req('PATCH', `/reservations/${resId}/cancel`, { token: stu })).status, 409)

    const r2 = await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: 1, reservationDate: dstr(30), pickupTime: '11:30', returnDate: dstr(31), purpose: 'Sim pickup reservation' } })
    const r2id = r2.data.id
    eq('reservation decide as student -> 403', (await req('PATCH', `/reservations/${r2id}/decide`, { token: stu, body: { action: 'approve' } })).status, 403)
    eq('reservation decide bad action -> 400', (await req('PATCH', `/reservations/${r2id}/decide`, { token: admin, body: { action: 'nope' } })).status, 400)
    const appr = await req('PATCH', `/reservations/${r2id}/decide`, { token: admin, body: { action: 'approve' } })
    eq('staff approve reservation -> 200', appr.status, 200)
    eq('reservation APPROVED', appr.data && appr.data.status, 'APPROVED')
    const stockBefore = (await req('GET', `/items/${testItemId}`)).data.availableQuantity
    const pick = await req('PATCH', `/reservations/${r2id}/pickup`, { token: admin })
    eq('pickup approved reservation -> 200', pick.status, 200)
    ok('pickup returns loan + reservation', !!(pick.data && pick.data.loan && pick.data.reservation))
    eq('reservation COMPLETED after pickup', pick.data && pick.data.reservation.status, 'COMPLETED')
    eq('pickup loan is BORROWED', pick.data && pick.data.loan && pick.data.loan.status, 'BORROWED')
    eq('pickup decrements stock', (await req('GET', `/items/${testItemId}`)).data.availableQuantity, stockBefore - 1)
    eq('pickup non-approved -> 409', (await req('PATCH', `/reservations/${r2id}/pickup`, { token: admin })).status, 409)
  }

  // ================= WAITLIST =================
  S('waitlist')
  {
    const TOTAL = (await req('GET', `/items/${testItemId}`)).data.totalQuantity
    const fill = await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: TOTAL, reservationDate: dstr(20), returnDate: dstr(22), purpose: 'Waitlist fill resv' } })
    eq('prep fill reservation -> 201', fill.status, 201)

    const join = await req('POST', '/waitlist', { token: fac, body: { itemId: testItemId, quantity: 1, wantedDate: dstr(20), pickupTime: '10:00', wantedReturn: dstr(22), purpose: 'Sim waitlist join' } })
    eq('POST /waitlist -> 201', join.status, 201)
    eq('waitlist position 1', join.data && join.data.position, 1)
    const entryId = join.data && join.data.id

    eq('duplicate join -> 409', (await req('POST', '/waitlist', { token: fac, body: { itemId: testItemId, quantity: 1, wantedDate: dstr(20), wantedReturn: dstr(22), purpose: 'Duplicate join' } })).status, 409)
    eq('join for free window -> 409', (await req('POST', '/waitlist', { token: stu, body: { itemId: testItemId, quantity: 1, wantedDate: dstr(40), wantedReturn: dstr(41), purpose: 'Free window join' } })).status, 409)
    eq('waitlist unknown item -> 404', (await req('POST', '/waitlist', { token: stu, body: { itemId: 999999, wantedDate: dstr(1), wantedReturn: dstr(2), purpose: 'Unknown waitlist' } })).status, 404)

    const mineStu = await req('GET', '/waitlist/mine', { token: stu })
    eq('GET /waitlist/mine -> 200', mineStu.status, 200)
    const mineFac = await req('GET', '/waitlist/mine', { token: fac })
    ok('waitlist mine shows WAITING entry', Array.isArray(mineFac.data) && mineFac.data.some((e) => e.id === entryId && e.status === 'WAITING'))
    eq('wrong user cannot claim WAITING -> 404', (await req('POST', `/waitlist/${entryId}/claim`, { token: stu })).status, 404)
    eq('claim while WAITING -> 409', (await req('POST', `/waitlist/${entryId}/claim`, { token: fac })).status, 409)
    eq('leave missing entry -> 404', (await req('PATCH', '/waitlist/999999/leave', { token: fac })).status, 404)

    // Free the held window -> the entry should be OFFERED and a notification sent.
    await req('PATCH', `/reservations/${fill.data.id}/cancel`, { token: stu })
    const offered = await req('GET', '/waitlist/mine', { token: fac })
    ok('window freed -> entry OFFERED', Array.isArray(offered.data) && offered.data.some((e) => e.id === entryId && e.status === 'OFFERED'))

    // notifications for the offer
    const notes = await req('GET', '/notifications', { token: fac })
    eq('GET /notifications -> 200', notes.status, 200)
    const offerNote = Array.isArray(notes.data) && notes.data.find((n) => n.type === 'WAITLIST_OFFER')
    ok('waitlist offer notification created', !!offerNote)
    eq('GET /notifications no token -> 401', (await req('GET', '/notifications')).status, 401)
    if (offerNote) {
      const one = await req('PATCH', `/notifications/${offerNote.id}/read`, { token: fac })
      eq('mark one notification read -> 200', one.status, 200)
    }
    eq('mark missing notification -> 404', (await req('PATCH', '/notifications/999999/read', { token: fac })).status, 404)
    const allRead = await req('PATCH', '/notifications/read', { token: fac })
    eq('mark all read -> 200', allRead.status, 200)

    // claim the offer
    const claim = await req('POST', `/waitlist/${entryId}/claim`, { token: fac })
    eq('claim OFFERED -> 201', claim.status, 201)
    eq('claim creates PENDING reservation', claim.data && claim.data.status, 'PENDING')
    eq('claim again -> 409', (await req('POST', `/waitlist/${entryId}/claim`, { token: fac })).status, 409)
    if (claim.data) await req('PATCH', `/reservations/${claim.data.id}/cancel`, { token: fac })

    // leave flow on a fresh taken window
    const fill2 = await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, quantity: TOTAL, reservationDate: dstr(45), returnDate: dstr(46), purpose: 'Leave fill resv' } })
    const join2 = await req('POST', '/waitlist', { token: stu, body: { itemId: testItemId, quantity: 1, wantedDate: dstr(45), wantedReturn: dstr(46), purpose: 'Sim waitlist leave' } })
    eq('second join -> 201', join2.status, 201)
    const leave = await req('PATCH', `/waitlist/${join2.data.id}/leave`, { token: stu })
    eq('leave waitlist -> 200', leave.status, 200)
    eq('left entry CANCELLED', leave.data && leave.data.status, 'CANCELLED')
    await req('PATCH', `/reservations/${fill2.data.id}/cancel`, { token: stu })
  }

  // ================= CREDITS =================
  S('credits')
  {
    const c = await req('GET', '/credits/mine', { token: stu })
    eq('GET /credits/mine -> 200', c.status, 200)
    eq('credits = 100', c.data && c.data.credits, 100)
    eq('canBorrow true', c.data && c.data.canBorrow, true)
    eq('tier full', c.data && c.data.tier && c.data.tier.key, 'full')
    ok('creditSummary has stats', !!(c.data && c.data.stats && 'totalLoans' in c.data.stats))
    eq('GET /credits/mine no token -> 401', (await req('GET', '/credits/mine')).status, 401)

    const facC = await req('GET', '/credits/mine', { token: fac })
    eq('fresh faculty credits 100', c === null ? null : c.data && c.data.credits, 100)
  }

  // ================= DASHBOARD =================
  S('dashboard')
  {
    const s = await req('GET', '/dashboard', { token: stu })
    eq('GET /dashboard (student) -> 200', s.status, 200)
    eq('student dashboard role BORROWER', s.data && s.data.role, 'BORROWER')
    ok('student dashboard has activeLoans/overdueCount', !!(s.data && typeof s.data.activeLoans === 'number' && typeof s.data.overdueCount === 'number'))
    ok('student dashboard has dueSoon + recent', !!(s.data && 'dueSoon' in s.data && 'recent' in s.data))
    const a = await req('GET', '/dashboard', { token: admin })
    eq('GET /dashboard admin -> 200', a.status, 200)
    eq('admin dashboard role ADMIN', a.data && a.data.role, 'ADMIN')
    ok('admin dashboard totals present', !!(a.data && typeof a.data.totalItems === 'number' && typeof a.data.totalUsers === 'number'))
    ok('admin dashboard pendingQueue + categoryBreakdown', !!(a.data && Array.isArray(a.data.pendingQueue) && Array.isArray(a.data.categoryBreakdown)))
    eq('GET /dashboard no token -> 401', (await req('GET', '/dashboard')).status, 401)
  }

  // ================= REPORTS =================
  S('reports')
  {
    const sum = await req('GET', '/reports/summary', { token: admin })
    eq('GET /reports/summary admin -> 200', sum.status, 200)
    ok('summary has counts', !!(sum.data && typeof sum.data.totalItems === 'number'))
    eq('GET /reports/summary as student -> 403', (await req('GET', '/reports/summary', { token: stu })).status, 403)
    eq('GET /reports/summary no token -> 401', (await req('GET', '/reports/summary')).status, 401)
    eq('GET /reports/most-borrowed -> 200', (await req('GET', '/reports/most-borrowed', { token: admin })).status, 200)
    eq('GET /reports/by-department -> 200', (await req('GET', '/reports/by-department', { token: admin })).status, 200)
    const dl = await req('GET', '/reports/damage-loss', { token: admin })
    eq('GET /reports/damage-loss -> 200', dl.status, 200)
    ok('damage-loss has incidents+damagedItems', !!(dl.data && Array.isArray(dl.data.incidents) && Array.isArray(dl.data.damagedItems)))

    const xlsx = await req('GET', '/reports/export/excel', { token: admin })
    eq('GET /reports/export/excel -> 200', xlsx.status, 200)
    ok('excel content-type', (xlsx.ct || '').includes('spreadsheetml.sheet'), xlsx.ct)
    ok('excel non-empty (zip magic)', !!(xlsx.buf && xlsx.buf.length > 1000 && xlsx.buf[0] === 0x50 && xlsx.buf[1] === 0x4b))
    const pdf = await req('GET', '/reports/export/pdf', { token: admin })
    eq('GET /reports/export/pdf -> 200', pdf.status, 200)
    ok('pdf content-type', (pdf.ct || '').includes('application/pdf'), pdf.ct)
    ok('pdf starts with %PDF', !!(pdf.buf && pdf.buf.slice(0, 4).toString() === '%PDF'))
    eq('reports export excel as student -> 403', (await req('GET', '/reports/export/excel', { token: stu })).status, 403)
  }

  // ================= CREDITS GATE (suspension) =================
  S('credits-gate')
  {
    await prisma.user.update({ where: { id: stuId }, data: { penaltyPoints: 5 } })
    const c = await req('GET', '/credits/mine', { token: stu })
    eq('penalty 5 -> credits 0', c.data && c.data.credits, 0)
    eq('penalty 5 -> tier suspended', c.data && c.data.tier && c.data.tier.key, 'suspended')
    eq('penalty 5 -> canBorrow false', c.data && c.data.canBorrow, false)

    const l = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Suspended loan', dateNeeded: dstr(1), returnDate: dstr(3) } })
    eq('suspended: POST /loans -> 403', l.status, 403)
    has('suspended loan message mentions credits', l.data && l.data.message, 'credits')
    eq('suspended: POST /reservations -> 403', (await req('POST', '/reservations', { token: stu, body: { itemId: testItemId, reservationDate: dstr(3), returnDate: dstr(4), purpose: 'Suspended resv' } })).status, 403)
    eq('suspended: POST /waitlist -> 403', (await req('POST', '/waitlist', { token: stu, body: { itemId: testItemId, wantedDate: dstr(3), wantedReturn: dstr(4), purpose: 'Suspended waitlist' } })).status, 403)
    eq('suspended: POST /loans/batch -> 403', (await req('POST', '/loans/batch', { token: stu, body: { purpose: 'Suspended batch', dateNeeded: dstr(1), returnDate: dstr(3), items: [{ itemId: testItemId, quantity: 1 }] } })).status, 403)

    await prisma.user.update({ where: { id: stuId }, data: { penaltyPoints: 0, isBlacklisted: true } })
    const bl = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Blacklisted loan', dateNeeded: dstr(1), returnDate: dstr(3) } })
    eq('blacklisted: POST /loans -> 403', bl.status, 403)
    has('blacklist message', bl.data && bl.data.message, 'suspended')

    await prisma.user.update({ where: { id: stuId }, data: { penaltyPoints: 0, isBlacklisted: false } })
    const restored = await req('GET', '/credits/mine', { token: stu })
    eq('restored credits 100', restored.data && restored.data.credits, 100)
    const l2 = await req('POST', '/loans', { token: stu, body: { itemId: testItemId, quantity: 1, purpose: 'Restored loan', dateNeeded: dstr(1), returnDate: dstr(3) } })
    eq('restored: POST /loans -> 201', l2.status, 201)
    if (l2.data) await req('DELETE', `/loans/${l2.data.id}`, { token: stu })
  }
}

async function cleanup() {
  const testItems = await prisma.item.findMany({ where: { name: { startsWith: 'SimTestWidget' } } })
  const itemIds = testItems.map((i) => i.id)
  const testUsers = await prisma.user.findMany({ where: { email: { startsWith: 'sim.' } } })
  const userIds = testUsers.map((u) => u.id)

  if (itemIds.length) await prisma.loan.deleteMany({ where: { itemId: { in: itemIds } } })
  if (userIds.length) {
    await prisma.loan.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.waitlistEntry.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.reservation.deleteMany({ where: { userId: { in: userIds } } })
  }
  if (itemIds.length) {
    await prisma.waitlistEntry.deleteMany({ where: { itemId: { in: itemIds } } })
    await prisma.reservation.deleteMany({ where: { itemId: { in: itemIds } } })
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } })
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  console.log(`\n[cleanup] removed ${itemIds.length} test item(s), ${userIds.length} test user(s) and their records`)
}

main()
  .catch((e) => { console.error('FATAL', e); results.push({ section: 'fatal', name: 'uncaught error', ok: false, detail: String(e && e.stack || e) }) })
  .finally(async () => {
    try { await cleanup() } catch (e) { console.error('cleanup error', e) }
    const passed = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    console.log('\n================ SUMMARY ================')
    console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed.length}`)
    if (failed.length) {
      console.log('\nFAILURES:')
      for (const f of failed) console.log(` - [${f.section}] ${f.name} :: ${f.detail}`)
    }
    await prisma.$disconnect()
  })
