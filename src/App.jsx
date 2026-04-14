import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

const CATEGORIES = [
  'Fuel',
  'Equipment',
  'Repairs',
  'Office',
  'Travel',
  'Meals',
  'Utilities',
  'Supplies',
  'Software',
  'Other',
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [capture, setCapture] = useState({
    vendor: '',
    amount: '',
    notes: '',
    costCentre: '',
    category: 'Other',
    receiptDate: today(),
    file: null,
    previewUrl: '',
  })

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user || !supabase) return
    loadAppData(session.user.id)
  }, [session?.user?.id])

  async function loadAppData(userId) {
    setLoading(true)
    setError('')

    try {
      const guessedName =
        session?.user?.user_metadata?.full_name ||
        name ||
        session?.user?.email?.split('@')[0] ||
        'User'

      await supabase
        .from('profiles')
        .upsert({ id: userId, full_name: guessedName, role: 'Staff' })

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError
      setProfile(profileRow)

      const { data: membershipRows, error: membershipError } = await supabase
        .from('workspace_members')
        .select('role, workspace_id, workspaces(id, name, abn)')
        .eq('user_id', userId)
        .limit(1)

      if (membershipError) throw membershipError

      const membership = membershipRows?.[0]

      if (!membership?.workspaces) {
        setWorkspace(null)
        setReceipts([])
        setLoading(false)
        return
      }

      setWorkspace({
        id: membership.workspaces.id,
        name: membership.workspaces.name,
        abn: membership.workspaces.abn,
        role: membership.role,
      })

      const { data: receiptRows, error: receiptError } = await supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .eq('workspace_id', membership.workspaces.id)
        .order('created_at', { ascending: false })

      if (receiptError) throw receiptError
      setReceipts(receiptRows || [])
    } catch (err) {
      setError(err.message || 'Could not load app data')
    } finally {
      setLoading(false)
    }
  }

  async function sendMagicLink() {
    if (!supabase) return
    setError('')
    setInfo('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name || email.split('@')[0] },
      },
    })

    if (error) setError(error.message)
    else setInfo('Check your email for the sign-in link.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setWorkspace(null)
    setReceipts([])
  }

  function onPickFile(file) {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setCapture((prev) => ({ ...prev, file, previewUrl }))
  }

  function resetCapture() {
    setCapture({
      vendor: '',
      amount: '',
      notes: '',
      costCentre: '',
      category: 'Other',
      receiptDate: today(),
      file: null,
      previewUrl: '',
    })
  }

  async function saveReceipt() {
    if (!supabase || !session?.user || !workspace) return

    setSaving(true)
    setError('')

    try {
      let imagePath = null

      if (capture.file) {
        const ext = capture.file.name.split('.').pop() || 'jpg'
        const path = `${session.user.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('receipt-images')
          .upload(path, capture.file)

        if (uploadError) throw uploadError
        imagePath = path
      }

      const amount = Number(capture.amount || 0)

      const { data: receiptRow, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          workspace_id: workspace.id,
          submitted_by: session.user.id,
          approved_by: workspace.role === 'Owner' ? session.user.id : null,
          vendor: capture.vendor || 'Receipt',
          receipt_date: capture.receiptDate,
          amount,
          category: capture.category,
          notes: capture.notes,
          status: workspace.role === 'Owner' ? 'Approved' : 'Pending',
          cost_centre: capture.costCentre,
          file_name: capture.file?.name || null,
          image_path: imagePath,
        })
        .select('id')
        .single()

      if (receiptError) throw receiptError

      const { error: itemError } = await supabase.from('receipt_items').insert({
        receipt_id: receiptRow.id,
        description: capture.vendor || 'Receipt item',
        amount,
        category: capture.category,
      })

      if (itemError) throw itemError

      resetCapture()
      await loadAppData(session.user.id)
    } catch (err) {
      setError(err.message || 'Could not save receipt')
    } finally {
      setSaving(false)
    }
  }

  async function approveReceipt(receiptId) {
    if (!supabase || !session?.user || workspace?.role !== 'Owner') return

    const { error } = await supabase
      .from('receipts')
      .update({
        status: 'Approved',
        approved_by: session.user.id,
      })
      .eq('id', receiptId)

    if (error) {
      setError(error.message || 'Could not approve receipt')
      return
    }

    await loadAppData(session.user.id)
  }

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const haystack = `${receipt.vendor} ${receipt.notes || ''} ${
        receipt.cost_centre || ''
      }`.toLowerCase()

      const searchMatch = haystack.includes(search.toLowerCase())
      const statusMatch =
        statusFilter === 'All' || receipt.status === statusFilter

      return searchMatch && statusMatch
    })
  }, [receipts, search, statusFilter])

  const myReceipts = filteredReceipts.filter(
    (r) => r.submitted_by === session?.user?.id
  )

  const total = filteredReceipts.reduce(
    (sum, receipt) => sum + Number(receipt.amount || 0),
    0
  )

  const pending = receipts.filter((r) => r.status === 'Pending').length
  const isSubmitter = workspace?.role === 'Submitter'
  const isOwner = workspace?.role === 'Owner'

  const categoryTotals = CATEGORIES.map((category) => {
    const total = filteredReceipts
      .flatMap((receipt) =>
        receipt.receipt_items?.length
          ? receipt.receipt_items
          : [{ category: receipt.category, amount: receipt.amount }]
      )
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    return { category, total }
  }).filter((row) => row.total > 0)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2>Supabase environment variables missing</h2>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 420, margin: '40px auto' }}>
          <h1 style={styles.title}>Receipt App</h1>
          <p style={styles.muted}>Simple shared receipt capture for two users.</p>

          <label style={styles.label}>Your name</label>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />

          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
          />

          <button style={styles.primaryButton} onClick={sendMagicLink}>
            Email me a sign-in link
          </button>

          {info ? <p style={styles.info}>{info}</p> : null}
          {error ? <p style={styles.errorText}>{error}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.topGrid}>
        <div style={styles.card}>
          <h1 style={styles.title}>Receipt App</h1>
          <p style={styles.muted}>Simple shared receipt capture for two users.</p>
          <div style={styles.metaRow}>
            <span>{profile?.full_name || session.user.email}</span>
            <span>
              {workspace ? `${workspace.name} · ${workspace.role}` : 'No workspace linked yet'}
            </span>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.statRow}>
            <span>Visible total</span>
            <strong>{money(total)}</strong>
          </div>
          <div style={styles.statRow}>
            <span>Pending</span>
            <strong>{pending}</strong>
          </div>
          <button style={styles.button} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {error ? <div style={styles.errorBanner}>{error}</div> : null}

      {!workspace ? (
        <div style={styles.card}>
          <h2>One-time setup still needed</h2>
          <p style={styles.muted}>
            Your user exists, but you have not been added to a workspace yet.
          </p>
        </div>
      ) : isSubmitter ? (
        <div style={styles.mobileOnlyWrap}>
          <div style={styles.card}>
            <h2>Quick receipt</h2>
            <p style={styles.muted}>Take a photo and save it fast.</p>

            <label style={styles.primaryButton}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              Take photo
            </label>

            <label style={styles.secondaryButton}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              Upload from phone
            </label>

            {capture.previewUrl ? (
              <img src={capture.previewUrl} alt="Receipt preview" style={styles.preview} />
            ) : null}

            <input
              style={styles.input}
              placeholder="Vendor"
              value={capture.vendor}
              onChange={(e) =>
                setCapture((prev) => ({ ...prev, vendor: e.target.value }))
              }
            />
            <input
              style={styles.input}
              placeholder="Amount"
              type="number"
              step="0.01"
              value={capture.amount}
              onChange={(e) =>
                setCapture((prev) => ({ ...prev, amount: e.target.value }))
              }
            />
            <select
              style={styles.input}
              value={capture.category}
              onChange={(e) =>
                setCapture((prev) => ({ ...prev, category: e.target.value }))
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              style={styles.input}
              placeholder="Cost centre"
              value={capture.costCentre}
              onChange={(e) =>
                setCapture((prev) => ({ ...prev, costCentre: e.target.value }))
              }
            />
            <textarea
              style={{ ...styles.input, minHeight: 90 }}
              placeholder="Notes"
              value={capture.notes}
              onChange={(e) =>
                setCapture((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
            <button
              style={styles.primaryButton}
              onClick={saveReceipt}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save receipt'}
            </button>
          </div>

          <div style={styles.card}>
            <h2>My recent receipts</h2>
            {myReceipts.length === 0 ? <p style={styles.muted}>No receipts yet.</p> : null}
            {myReceipts.map((receipt) => (
              <div key={receipt.id} style={styles.receiptRow}>
                <div>
                  <strong>{receipt.vendor}</strong>
                  <div style={styles.smallMuted}>
                    {receipt.status} · {receipt.receipt_date}
                  </div>
                </div>
                <strong>{money(receipt.amount)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={styles.ownerGrid}>
          <div style={styles.leftCol}>
            <div style={styles.card}>
              <h2>Owner tools</h2>
              <p style={styles.muted}>Quick add a receipt with a phone photo.</p>

              <label style={styles.primaryButton}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                Take photo
              </label>

              <label style={styles.secondaryButton}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                Upload file
              </label>

              {capture.previewUrl ? (
                <img src={capture.previewUrl} alt="Receipt preview" style={styles.preview} />
              ) : null}

              <input
                style={styles.input}
                placeholder="Vendor"
                value={capture.vendor}
                onChange={(e) =>
                  setCapture((prev) => ({ ...prev, vendor: e.target.value }))
                }
              />
              <input
                style={styles.input}
                placeholder="Amount"
                type="number"
                step="0.01"
                value={capture.amount}
                onChange={(e) =>
                  setCapture((prev) => ({ ...prev, amount: e.target.value }))
                }
              />
              <select
                style={styles.input}
                value={capture.category}
                onChange={(e) =>
                  setCapture((prev) => ({ ...prev, category: e.target.value }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                style={styles.input}
                placeholder="Cost centre"
                value={capture.costCentre}
                onChange={(e) =>
                  setCapture((prev) => ({ ...prev, costCentre: e.target.value }))
                }
              />
              <textarea
                style={{ ...styles.input, minHeight: 90 }}
                placeholder="Notes"
                value={capture.notes}
                onChange={(e) =>
                  setCapture((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
              <button
                style={styles.primaryButton}
                onClick={saveReceipt}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save receipt'}
              </button>
            </div>

            <div style={styles.card}>
              <h2>Filters</h2>
              <label style={styles.label}>Search</label>
              <input
                style={styles.input}
                placeholder="Vendor, notes, cost centre"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <label style={styles.label}>Status</label>
              <select
                style={styles.input}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option>All</option>
                <option>Pending</option>
                <option>Approved</option>
              </select>
            </div>

            <div style={styles.card}>
              <h2>Totals by category</h2>
              {categoryTotals.length === 0 ? (
                <p style={styles.muted}>No totals yet.</p>
              ) : (
                categoryTotals.map((row) => (
                  <div key={row.category} style={styles.receiptRow}>
                    <span>{row.category}</span>
                    <strong>{money(row.total)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={styles.rightCol}>
            <div style={styles.card}>
              <h2>Receipts</h2>
              {filteredReceipts.length === 0 ? (
                <p style={styles.muted}>No receipts yet.</p>
              ) : (
                filteredReceipts.map((receipt) => (
                  <div key={receipt.id} style={styles.receiptBlock}>
                    <div>
                      <strong>{receipt.vendor}</strong>
                      <div style={styles.smallMuted}>
                        {receipt.receipt_date} · {receipt.status} ·{' '}
                        {receipt.cost_centre || 'No cost centre'}
                      </div>
                      {receipt.notes ? (
                        <div style={styles.smallMuted}>{receipt.notes}</div>
                      ) : null}
                    </div>
                    <div style={styles.receiptActionCol}>
                      <strong>{money(receipt.amount)}</strong>
                      {isOwner && receipt.status !== 'Approved' ? (
                        <button style={styles.button} onClick={() => approveReceipt(receipt.id)}>
                          Approve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f7fb',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    color: '#122033',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #dde3ec',
    borderRadius: '16px',
    padding: '20px',
    boxSizing: 'border-box',
  },
  title: {
    margin: 0,
    marginBottom: '10px',
    fontSize: '28px',
  },
  muted: {
    color: '#5c6b7a',
  },
  smallMuted: {
    color: '#5c6b7a',
    fontSize: '13px',
    marginTop: '4px',
  },
  info: {
    color: '#155724',
    marginTop: '12px',
  },
  errorText: {
    color: '#b00020',
    marginTop: '12px',
  },
  errorBanner: {
    background: '#ffe5e8',
    color: '#9d1730',
    border: '1px solid #f3b8c0',
    padding: '12px 14px',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  authCard: {
    display: 'grid',
    gap: '10px',
  },
  label: {
    fontSize: '14px',
    marginTop: '6px',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #ccd6e2',
    boxSizing: 'border-box',
    marginBottom: '10px',
    fontSize: '16px',
  },
  button: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #ccd6e2',
    background: '#f4f6f8',
    cursor: 'pointer',
    fontSize: '16px',
  },
  primaryButton: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px',
    marginBottom: '10px',
  },
  secondaryButton: {
    display: 'block',
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid #ccd6e2',
    background: '#fff',
    color: '#122033',
    cursor: 'pointer',
    fontSize: '16px',
    textAlign: 'center',
    boxSizing: 'border-box',
    marginBottom: '10px',
  },
  topGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '12px',
    color: '#5c6b7a',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
    fontSize: '18px',
  },
  ownerGrid: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: '16px',
  },
  leftCol: {
    display: 'grid',
    gap: '16px',
  },
  rightCol: {
    display: 'grid',
    gap: '16px',
  },
  mobileOnlyWrap: {
    display: 'grid',
    gap: '16px',
    maxWidth: '560px',
    margin: '0 auto',
  },
  preview: {
    width: '100%',
    maxHeight: '280px',
    objectFit: 'contain',
    borderRadius: '12px',
    border: '1px solid #dde3ec',
    marginBottom: '12px',
    background: '#fff',
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: '1px solid #eef2f6',
  },
  receiptBlock: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '14px 0',
    borderBottom: '1px solid #eef2f6',
  },
  receiptActionCol: {
    display: 'grid',
    gap: '8px',
    minWidth: '120px',
  },
}

if (typeof window !== 'undefined') {
  const mobile = window.innerWidth < 900
  if (mobile) {
    styles.page.padding = '12px'
    styles.topGrid.gridTemplateColumns = '1fr'
    styles.ownerGrid.gridTemplateColumns = '1fr'
    styles.title.fontSize = '24px'
  }
}