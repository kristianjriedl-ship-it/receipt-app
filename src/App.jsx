// 🔥 CLEAN VERSION WITH CATEGORIES + FINANCIAL YEAR

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function getFinancialYear(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  return month >= 7 ? `${year}-${(year + 1).toString().slice(2)}` : `${year - 1}-${year.toString().slice(2)}`
}

export default function App() {
  const [session, setSession] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [receipts, setReceipts] = useState([])
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [financialYearFilter, setFinancialYearFilter] = useState('All')

  const [form, setForm] = useState({
    vendor: '',
    amount: '',
    category: '',
    date: new Date().toISOString().slice(0, 10)
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (session) loadData()
  }, [session])

  async function loadData() {
    const userId = session.user.id

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(name)')
      .eq('user_id', userId)
      .single()

    if (!membership) return

    setWorkspace(membership)

    const { data: receipts } = await supabase
      .from('receipts')
      .select('*')
      .eq('workspace_id', membership.workspace_id)

    setReceipts(receipts || [])

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_id', membership.workspace_id)

    setCategories(cats?.map(c => c.name) || [])
  }

  async function addReceipt() {
    const fy = getFinancialYear(form.date)

    await supabase.from('receipts').insert({
      workspace_id: workspace.workspace_id,
      submitted_by: session.user.id,
      vendor: form.vendor,
      amount: Number(form.amount),
      category: form.category,
      receipt_date: form.date,
      financial_year: fy,
      status: 'Pending'
    })

    loadData()
  }

  async function addCategory() {
    await supabase.from('categories').insert({
      workspace_id: workspace.workspace_id,
      name: newCategory
    })

    setNewCategory('')
    loadData()
  }

  const filtered = receipts.filter(r =>
    financialYearFilter === 'All' || r.financial_year === financialYearFilter
  )

  if (!session) return <button onClick={() => supabase.auth.signInWithOtp({ email: prompt('Email') })}>Login</button>

  return (
    <div style={{ padding: 20 }}>
      <h1>Receipt App</h1>

      <h2>Add Receipt</h2>

      <input placeholder="Vendor" onChange={e => setForm({ ...form, vendor: e.target.value })} />
      <input placeholder="Amount" type="number" onChange={e => setForm({ ...form, amount: e.target.value })} />

      <select onChange={e => setForm({ ...form, category: e.target.value })}>
        <option>Select category</option>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>

      <input type="date" onChange={e => setForm({ ...form, date: e.target.value })} />

      <button onClick={addReceipt}>Save</button>

      <h3>Add Category</h3>
      <input value={newCategory} onChange={e => setNewCategory(e.target.value)} />
      <button onClick={addCategory}>Add</button>

      <h2>Filter by Financial Year</h2>
      <select onChange={e => setFinancialYearFilter(e.target.value)}>
        <option>All</option>
        {[...new Set(receipts.map(r => r.financial_year))].map(fy => (
          <option key={fy}>{fy}</option>
        ))}
      </select>

      <h2>Receipts</h2>
      {filtered.map(r => (
        <div key={r.id}>
          {r.vendor} - ${r.amount} - {r.category} - {r.financial_year}
        </div>
      ))}
    </div>
  )
}