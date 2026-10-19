import { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage } from '../../api/client'
import type { Category, Item } from '../../types'
import { conditionTone, itemStatusTone } from '../../lib/format'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { CategoryIcon } from '../../components/CategoryIcon'
import { Icon } from '../../components/Icon'

interface FormState {
  name: string
  categoryId: string
  department: string
  totalQuantity: string
  availableQuantity: string
  condition: string
  status: string
  description: string
}

const EMPTY_FORM: FormState = {
  name: '',
  categoryId: '',
  department: '',
  totalQuantity: '1',
  availableQuantity: '',
  condition: 'GOOD',
  status: 'AVAILABLE',
  description: '',
}

export default function AdminInventory() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [qrItem, setQrItem] = useState<Item | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    Promise.all([api.get<Item[]>('/items'), api.get<Category[]>('/categories')])
      .then(([its, cats]) => {
        setItems(its.data)
        setCategories(cats.data)
      })
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    if (!q) return items
    const needle = q.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(needle) || i.code.toLowerCase().includes(needle) || (i.department ?? '').toLowerCase().includes(needle))
  }, [items, q])

  function openCreate() {
    setForm({ ...EMPTY_FORM, categoryId: categories[0] ? String(categories[0].id) : '' })
    setCreating(true)
  }

  function openEdit(item: Item) {
    setForm({
      name: item.name,
      categoryId: String(item.categoryId),
      department: item.department ?? '',
      totalQuantity: String(item.totalQuantity),
      availableQuantity: String(item.availableQuantity),
      condition: item.condition,
      status: item.status,
      description: item.description ?? '',
    })
    setEditing(item)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name,
        categoryId: Number(form.categoryId),
        department: form.department || undefined,
        totalQuantity: Number(form.totalQuantity),
        availableQuantity: form.availableQuantity === '' ? undefined : Number(form.availableQuantity),
        condition: form.condition,
        status: form.status,
        description: form.description || undefined,
      }
      if (editing) await api.put(`/items/${editing.id}`, payload)
      else await api.post('/items', payload)
      setEditing(null)
      setCreating(false)
      load()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete "${item.name}" (${item.code})? This cannot be undone.`)) return
    try {
      await api.delete(`/items/${item.id}`)
      load()
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  async function uploadImage() {
    if (!editing || !fileRef.current?.files?.[0]) return
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('image', fileRef.current.files[0])
      const res = await api.post<Item>(`/items/${editing.id}/image`, fd)
      setEditing(res.data)
      load()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Inventory Management"
        description="Add, edit and retire equipment. Generate QR codes for quick check-out."
        actions={
          <Button onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" />
            Add item
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, code or department..." className="pl-9" />
        </div>
      </Card>

      <Card>
        <CardHeader title={`${filtered.length} item(s)`} />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No items found" hint="Adjust your search or add a new item." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Category</th>
                  <th className="th">Department</th>
                  <th className="th">Availability</th>
                  <th className="th">Condition</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary-50 text-primary-300">
                          {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <CategoryIcon slug={item.category.slug} className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{item.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{item.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td text-xs">{item.category.name}</td>
                    <td className="td text-xs">{item.department ?? '-'}</td>
                    <td className="td whitespace-nowrap text-xs tabular-nums">
                      {item.availableQuantity} / {item.totalQuantity}
                    </td>
                    <td className="td">
                      <Badge tone={conditionTone[item.condition] as never}>{item.condition}</Badge>
                    </td>
                    <td className="td">
                      <Badge tone={itemStatusTone[item.status] as never}>{item.status}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>
                          <Icon name="edit" className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setQrItem(item)}>
                          <Icon name="qr" className="h-3.5 w-3.5" />
                          QR
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => remove(item)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? `Edit ${editing.name}` : 'Add new item'}
        wide
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save item'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. HD Projector" />
          </Field>
          <Field label="Category">
            <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department (optional)">
            <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="e.g. Media Studies" />
          </Field>
          <Field label="Total quantity">
            <Input type="number" min={0} value={form.totalQuantity} onChange={(e) => setForm((f) => ({ ...f, totalQuantity: e.target.value }))} />
          </Field>
          <Field label="Available quantity">
            <Input type="number" min={0} value={form.availableQuantity} onChange={(e) => setForm((f) => ({ ...f, availableQuantity: e.target.value }))} placeholder="Defaults to total" />
          </Field>
          <Field label="Condition">
            <Select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}>
              <option value="NEW">New</option>
              <option value="GOOD">Good</option>
              <option value="DAMAGED">Damaged</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="AVAILABLE">Available</option>
              <option value="MAINTENANCE">Under maintenance</option>
              <option value="RETIRED">Retired</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description (optional)">
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
          </div>
          {editing && (
            <div className="sm:col-span-2">
              <Field label="Photo">
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={fileRef} type="file" accept="image/*" className="input cursor-pointer py-1.5 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
                  <Button variant="secondary" size="sm" onClick={uploadImage} disabled={saving}>
                    Upload
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">JPG/PNG up to 5MB.</p>
              </Field>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(qrItem)} onClose={() => setQrItem(null)} title={`QR code - ${qrItem?.name ?? ''}`}>
        {qrItem && (
          <div className="flex flex-col items-center gap-3">
            <img src={`/api/items/${qrItem.id}/qrcode`} alt={`QR code for ${qrItem.name}`} className="h-64 w-64 border border-slate-200 bg-white p-2" />
            <p className="font-mono text-sm font-bold tracking-wider text-slate-700">{qrItem.code}</p>
            <a href={`/api/items/${qrItem.id}/qrcode`} download={`${qrItem.code}.png`}>
              <Button variant="secondary" size="sm">
                Download PNG
              </Button>
            </a>
            <p className="text-center text-xs text-slate-400">Print and attach this QR code to the physical item so staff can scan it during check-out and check-in.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
