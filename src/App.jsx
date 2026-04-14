import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

const categories = ['Fuel', 'Equipment', 'Repairs', 'Office', 'Travel', 'Meals', 'Utilities', 'Supplies', 'Software', 'Other']

const SETUP_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'Submitter',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  vendor text not null default 'Unknown vendor',
  receipt_date date not null default current_date,
  amount numeric(12,2) not null default 0,
  category text not null default 'Other',
  notes text,
  status text not null default 'Pending',
  cost_centre text,
  file_name text,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null default 0,
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy if not exists profiles_select_own on public.profiles
for select using (auth.uid() = id);
create policy if not exists profiles_insert_own on public.profiles
for insert with check (auth.uid() = id);
create policy if not exists profiles_update_own on public.profiles
for update using (auth.uid() = id);

create policy if not exists workspace_members_select_member on public.workspace_members
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id and wm.user_id = auth.uid()
  )
);

create policy if not exists workspaces_select_member on public.workspaces
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
  )
);

create policy if not exists receipts_select_member on public.receipts
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid()
  )
);

create policy if not exists receipts_insert_member on public.receipts
for insert with check (
  submitted_by = auth.uid() and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid()
  )
);

create policy if not exists receipts_update_owner on public.receipts
for update using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid() and wm.role = 'Owner'
  )
);

create policy if not exists receipt_items_select_member on public.receipt_items
for select using (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id and wm.user_id = auth.uid()
  )
);

create policy if not exists receipt_items_insert_member on public.receipt_items
for insert with check (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id and wm.user_id = auth.uid()
  )
);
`

function currency(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value || 0))
}

function statusClass(status) {
  return status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : 'pending'
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function guessVendor(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim() || 'Unknown vendor'
}

function SetupScreen() {
  return (
    <div className="auth-shell">
      <div className="card auth-card column">
        <h2>Supabase setup required</h2>
        <p className="muted">Add your two Vercel environment variables, then redeploy.</p>
        <div className="codebox">VITE_SUPABASE_URL=https://your-project.supabase.co{`\n`}VITE_SUPABASE_ANON_KEY=sb_publishable_xxx</div>
        <p className="muted small">After deploy, create a bucket named <strong>receipt-images</strong> and run the SQL below in Supabase SQL Editor.</p>
        <div className="codebox">{SETUP_SQL}</div>
      </div>
    </div>
  )
}

function SignInScreen({ email, setEmail, name, setName, onSignIn, info, error }) {
  return (
    <div className="auth-shell">
      <div className="card auth-card column">
        <h2>Receipt App</h2>
        <p className="muted">Sign in with email. This app is built for one owner and one submitter.</p>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <button className="primary" onClick={onSignIn}>Email me a sign-in link</button>
        {info ? <div className="notice">{info}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
      </div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [membershipRole, setMembershipRole] = useState('Submitter')
  const [receipts, setReceipts] = useState([])
  const [tab, setTab] = useState('receipts')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [captureFile, setCaptureFile] = useState(null)
  const [capturePreview, setCapturePreview] = useState('')
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [form, setForm] = useState({
    vendor: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Other',
    costCentre: '',
    notes: '',
    items: [{ id: crypto.randomUUID(), description: '', amount: 0, category: 'Other' }],
  })

  const isOwner = membershipRole === 'Owner'

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLoading(false)
      return
    }

    let active = true

    async function loadAll() {
      setLoading(true)
      setError('')
      try {
        await ensureProfile(session.user)
        const result = await loadWorkspaceAndReceipts(session.user.id)
        if (!active) return
        setProfile(result.profile)
        setWorkspace(result.workspace)
        setMembershipRole(result.role || 'Submitter')
        setReceipts(result.receipts)
      } catch (err) {
        if (active) setError(err.message || 'Could not load app data.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAll()
    return () => {
      active = false
    }
  }, [session?.user?.id])

  async function ensureProfile(user) {
    const fullName = user.user_metadata?.full_name || name || user.email?.split('@')[0] || 'User'
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: fullName }, { onConflict: 'id' })
    if (upsertError) throw upsertError
  }

  async function loadWorkspaceAndReceipts(userId) {
    const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (profileError) throw profileError

    const { data: memberData, error: memberError } = await supabase
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (memberError) throw memberError

    const chosenWorkspace = memberData?.workspace || null
    if (!chosenWorkspace) {
      return { profile: profileData, workspace: null, role: 'Submitter', receipts: [] }
    }

    const { data: receiptData, error: receiptsError } = await supabase
      .from('receipts')
      .select(`
        id, workspace_id, submitted_by, approved_by, vendor, receipt_date, amount, category, notes, status, cost_centre, file_name, image_path, created_at,
        receipt_items(id, description, amount, category),
        submitter:profiles!receipts_submitted_by_fkey(full_name),
        approver:profiles!receipts_approved_by_fkey(full_name)
      `)
      .eq('workspace_id', chosenWorkspace.id)
      .order('receipt_date', { ascending: false })

    if (receiptsError) throw receiptsError

    return {
      profile: profileData,
      workspace: chosenWorkspace,
      role: memberData.role,
      receipts: (receiptData || []).map((r) => ({
        ...r,
        submitted_by_name: r.submitter?.full_name || 'Unknown',
        approved_by_name: r.approver?.full_name || '',
        items: r.receipt_items || [],
      })),
    }
  }

  async function handleSignIn() {
    setInfo('')
    setError('')
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href, data: { full_name: name || email.split('@')[0] } },
    })
    if (signInError) {
      setError(signInError.message)
      return
    }
    setInfo('Check your email for the sign-in link.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setWorkspace(null)
    setReceipts([])
  }

  async function handleQuickCapture(file) {
    if (!file || !workspace || !session?.user) return
    setSaving(true)
    setError('')
    try {
      const preview = await fileToDataUrl(file)
      setCapturePreview(preview)
      setCaptureFile(file)

      const imagePath = await uploadImage(file)
      const vendor = guessVendor(file.name)
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          workspace_id: workspace.id,
          submitted_by: session.user.id,
          vendor,
          receipt_date: new Date().toISOString().slice(0, 10),
          amount: 0,
          category: 'Other',
          notes: 'Quick mobile capture',
          status: 'Pending',
          file_name: file.name,
          image_path: imagePath,
        })
        .select('id')
        .single()

      if (receiptError) throw receiptError

      const { error: itemError } = await supabase.from('receipt_items').insert({
        receipt_id: receipt.id,
        description: 'Receipt captured',
        amount: 0,
        category: 'Other',
      })
      if (itemError) throw itemError

      await refreshReceipts()
      setInfo('Receipt saved. You can fill in details later.')
    } catch (err) {
      setError(err.message || 'Could not save receipt.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file) {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('receipt-images').upload(path, file, { upsert: false })
    if (uploadError) throw uploadError
    return path
  }

  async function refreshReceipts() {
    if (!session?.user) return
    const result = await loadWorkspaceAndReceipts(session.user.id)
    setReceipts(result.receipts)
    setMembershipRole(result.role)
    setWorkspace(result.workspace)
    setProfile(result.profile)
  }

  async function approveReceipt(receiptId) {
    setError('')
    const { error: updateError } = await supabase
      .from('receipts')
      .update({ status: 'Approved', approved_by: session.user.id })
      .eq('id', receiptId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await refreshReceipts()
  }

  async function createOwnerReceipt(e) {
    e.preventDefault()
    if (!workspace) return
    setSaving(true)
    setError('')
    try {
      const items = form.items.filter((item) => item.description.trim() || Number(item.amount) > 0)
      const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          workspace_id: workspace.id,
          submitted_by: session.user.id,
          vendor: form.vendor || 'Manual entry',
          receipt_date: form.date,
          amount,
          category: form.category,
          notes: form.notes,
          status: 'Pending',
          cost_centre: form.costCentre,
        })
        .select('id')
        .single()
      if (receiptError) throw receiptError

      const payload = (items.length ? items : [{ description: 'Main item', amount: 0, category: form.category }]).map((item) => ({
        receipt_id: receipt.id,
        description: item.description || 'Main item',
        amount: Number(item.amount || 0),
        category: item.category || form.category,
      }))
      const { error: itemsError } = await supabase.from('receipt_items').insert(payload)
      if (itemsError) throw itemsError

      setForm({
        vendor: '',
        date: new Date().toISOString().slice(0, 10),
        category: 'Other',
        costCentre: '',
        notes: '',
        items: [{ id: crypto.randomUUID(), description: '', amount: 0, category: 'Other' }],
      })
      setShowOwnerForm(false)
      await refreshReceipts()
    } catch (err) {
      setError(err.message || 'Could not save receipt.')
    } finally {
      setSaving(false)
    }
  }

  function updateItem(id, key, value) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.id === id ? { ...item, [key]: key === 'amount' ? Number(value) : value } : item),
    }))
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { id: crypto.randomUUID(), description: '', amount: 0, category: 'Other' }] }))
  }

  function removeItem(id) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }))
  }

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const haystack = [receipt.vendor, receipt.notes, receipt.file_name, receipt.cost_centre, receipt.submitted_by_name, ...receipt.items.map((item) => item.description)].join(' ').toLowerCase()
      const matchesQuery = haystack.includes(query.toLowerCase())
      const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [receipts, query, statusFilter])

  const total = useMemo(() => filteredReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0), [filteredReceipts])
  const pendingCount = useMemo(() => receipts.filter((receipt) => receipt.status === 'Pending').length, [receipts])
  const totalsByCategory = useMemo(() => categories.map((category) => ({
    category,
    total: filteredReceipts.reduce((sum, receipt) => sum + receipt.items.filter((item) => item.category === category).reduce((n, item) => n + Number(item.amount || 0), 0), 0),
  })).filter((row) => row.total > 0), [filteredReceipts])

  if (!supabase) return <SetupScreen />
  if (!session) return <SignInScreen email={email} setEmail={setEmail} name={name} setName={setName} onSignIn={handleSignIn} info={info} error={error} />

  return (
    <div className="page column">
      <div className="header-grid">
        <div className="card column">
          <h1>Receipt App</h1>
          <p className="muted">Simple shared receipt capture for two users.</p>
          <div className="row small muted">
            <span>{profile?.full_name || session.user.email}</span>
            <span>{workspace ? `${workspace.name} · ${membershipRole}` : 'No workspace linked yet'}</span>
          </div>
        </div>
        <div className="card column">
          <div className="row"><span className="muted">Visible total</span><strong>{currency(total)}</strong></div>
          <div className="row"><span className="muted">Pending</span><strong>{pendingCount}</strong></div>
          <button className="secondary" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {info ? <div className="notice">{info}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {!workspace ? (
        <div className="card column">
          <h2>One-time setup still needed</h2>
          <p className="muted">Your user exists, but you have not been added to a workspace yet.</p>
          <p className="muted small">Run the SQL in the README after you create a workspace and add both users.</p>
          <div className="codebox">{SETUP_SQL}</div>
        </div>
      ) : (
        <div className="content-grid">
          <div className="column">
            {!isOwner ? (
              <div className="card mobile-capture">
                <h2>Quick capture</h2>
                <p className="muted">Tap once, take the photo, and it saves as pending.</p>
                <label className="capture-button">
                  + Add receipt
                  <input className="hidden-input" type="file" accept="image/*" capture="environment" onChange={(e) => handleQuickCapture(e.target.files?.[0])} />
                </label>
                {saving ? <div className="notice">Saving receipt...</div> : null}
                {capturePreview ? <img src={capturePreview} alt="Receipt preview" className="image-preview" /> : null}
              </div>
            ) : (
              <div className="card column">
                <h2>Owner tools</h2>
                <button className="primary" onClick={() => setShowOwnerForm((v) => !v)}>{showOwnerForm ? 'Hide manual form' : 'Add manual receipt'}</button>
                {showOwnerForm ? (
                  <form className="column" onSubmit={createOwnerReceipt}>
                    <div className="form-grid">
                      <label>Vendor<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label>
                      <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                      <label>Default category
                        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                          {categories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                      </label>
                      <label>Cost centre<input value={form.costCentre} onChange={(e) => setForm({ ...form, costCentre: e.target.value })} /></label>
                    </div>
                    <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
                    <div className="items-grid">
                      <div className="row"><h3>Cost items</h3><button type="button" className="secondary" onClick={addItem}>Add item</button></div>
                      {form.items.map((item) => (
                        <div className="item-row" key={item.id}>
                          <label>Description<input value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} /></label>
                          <label>Amount<input type="number" step="0.01" value={item.amount} onChange={(e) => updateItem(item.id, 'amount', e.target.value)} /></label>
                          <label>Category
                            <select value={item.category} onChange={(e) => updateItem(item.id, 'category', e.target.value)}>
                              {categories.map((category) => <option key={category}>{category}</option>)}
                            </select>
                          </label>
                          <button type="button" className="danger" onClick={() => removeItem(item.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save receipt'}</button>
                  </form>
                ) : null}
              </div>
            )}

            <div className="card filters-grid">
              <h2>Filters</h2>
              <label>Search<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vendor, notes, cost centre" /></label>
              <label>Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </label>
            </div>

            <div className="card totals-list">
              <h2>Totals by category</h2>
              {totalsByCategory.length === 0 ? <p className="muted">No totals yet.</p> : totalsByCategory.map((row) => (
                <div className="list-row" key={row.category}><span>{row.category}</span><strong>{currency(row.total)}</strong></div>
              ))}
            </div>
          </div>

          <div className="column">
            <div className="card">
              <div className="tabbar">
                <button className={tab === 'receipts' ? 'active' : 'secondary'} onClick={() => setTab('receipts')}>Receipts</button>
                <button className={tab === 'summary' ? 'active' : 'secondary'} onClick={() => setTab('summary')}>Summary</button>
              </div>
              {tab === 'receipts' ? (
                <div className="column">
                  {loading ? <p className="muted">Loading...</p> : filteredReceipts.length === 0 ? <p className="muted">No receipts yet.</p> : filteredReceipts.map((receipt) => (
                    <ReceiptCard key={receipt.id} receipt={receipt} canApprove={isOwner && receipt.status !== 'Approved'} onApprove={() => approveReceipt(receipt.id)} />
                  ))}
                </div>
              ) : (
                <div className="workspace-list">
                  <div className="list-row"><span>Workspace</span><strong>{workspace.name}</strong></div>
                  <div className="list-row"><span>Your role</span><strong>{membershipRole}</strong></div>
                  <div className="list-row"><span>Total receipts</span><strong>{receipts.length}</strong></div>
                  <div className="list-row"><span>Pending approvals</span><strong>{pendingCount}</strong></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptCard({ receipt, canApprove, onApprove }) {
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    let active = true
    async function loadSignedUrl() {
      if (!receipt.image_path || !supabase) return
      const { data } = await supabase.storage.from('receipt-images').createSignedUrl(receipt.image_path, 3600)
      if (active) setImageUrl(data?.signedUrl || '')
    }
    loadSignedUrl()
    return () => {
      active = false
    }
  }, [receipt.image_path])

  return (
    <div className="receipt-card">
      <div className="row">
        <div className="column">
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <strong>{receipt.vendor}</strong>
            <span className={`badge ${statusClass(receipt.status)}`}>{receipt.status}</span>
            <span className="badge">{receipt.category}</span>
          </div>
          <div className="receipt-meta">
            <span>{receipt.receipt_date}</span>
            <span>{receipt.submitted_by_name}</span>
            <span>{receipt.cost_centre || 'No cost centre'}</span>
            <span>{receipt.file_name || 'No file name'}</span>
          </div>
        </div>
        <strong>{currency(receipt.amount)}</strong>
      </div>
      {receipt.notes ? <p className="muted small">{receipt.notes}</p> : null}
      {imageUrl ? <img className="image-preview" src={imageUrl} alt={receipt.vendor} /> : null}
      <div className="items-list">
        {receipt.items.map((item) => (
          <div className="list-row" key={item.id}><span>{item.description} · {item.category}</span><strong>{currency(item.amount)}</strong></div>
        ))}
      </div>
      {canApprove ? <button className="primary" onClick={onApprove}>Approve</button> : null}
    </div>
  )
}

export default App
