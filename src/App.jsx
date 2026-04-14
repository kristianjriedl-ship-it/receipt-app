import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  Receipt,
  Users,
  Building2,
  Search,
  Download,
  Plus,
  DollarSign,
  CalendarDays,
  Tag,
  Camera,
  Upload,
  FileText,
  Shield,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

/**
 * Supabase-backed multi-user receipt app
 *
 * Before using:
 * 1) Create a Supabase project.
 * 2) Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 * 3) Create the tables shown in the SETUP_SQL constant below.
 * 4) Create a storage bucket named: receipt-images
 * 5) Turn on email auth in Supabase.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const categories = [
  "Fuel",
  "Equipment",
  "Repairs",
  "Office",
  "Travel",
  "Meals",
  "Utilities",
  "Supplies",
  "Software",
  "Other",
];

const SETUP_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'Staff',
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abn text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'Member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  vendor text not null,
  receipt_date date not null,
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

create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id);

create policy "workspace_members_select_member" on public.workspace_members
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);

create policy "workspaces_select_member" on public.workspaces
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

create policy "receipts_select_member" on public.receipts
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id
      and wm.user_id = auth.uid()
  )
);

create policy "receipts_insert_member" on public.receipts
for insert with check (
  submitted_by = auth.uid()
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id
      and wm.user_id = auth.uid()
  )
);

create policy "receipts_update_member" on public.receipts
for update using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id
      and wm.user_id = auth.uid()
  )
);

create policy "receipt_items_select_member" on public.receipt_items
for select using (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id
      and wm.user_id = auth.uid()
  )
);

create policy "receipt_items_insert_member" on public.receipt_items
for insert with check (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id
      and wm.user_id = auth.uid()
  )
);

create policy "receipt_items_update_member" on public.receipt_items
for update using (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id
      and wm.user_id = auth.uid()
  )
);
`;

function statusTone(status) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function toCsv(rows) {
  const headers = [
    "Workspace",
    "Date",
    "Vendor",
    "Amount",
    "Category",
    "Status",
    "Submitted By",
    "Approved By",
    "Cost Centre",
    "Notes",
  ];

  return [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.workspace_name,
        r.receipt_date,
        r.vendor,
        r.amount,
        r.category,
        r.status,
        r.submitted_by_name,
        r.approved_by_name,
        r.cost_centre,
        r.notes,
      ]
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");
}

function downloadCsv(rows) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "compiled-receipts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function readFileAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ReceiptForm({ workspaces, onSubmit, busy }) {
  const [form, setForm] = useState({
    workspaceId: workspaces[0]?.id || "",
    vendor: "",
    date: new Date().toISOString().slice(0, 10),
    category: "Other",
    notes: "",
    costCentre: "",
    file: null,
    fileName: "",
    items: [{ id: crypto.randomUUID(), description: "", amount: 0, category: "Other" }],
  });

  useEffect(() => {
    if (!form.workspaceId && workspaces[0]?.id) {
      setForm((prev) => ({ ...prev, workspaceId: workspaces[0].id }));
    }
  }, [workspaces, form.workspaceId]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateItem(id, key, value) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, [key]: key === "amount" ? Number(value) : value } : item
      ),
    }));
  }

  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { id: crypto.randomUUID(), description: "", amount: 0, category: "Other" }],
    }));
  }

  function removeItem(id) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = form.items.filter((item) => item.description.trim() || Number(item.amount) > 0);
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    await onSubmit({
      workspaceId: form.workspaceId,
      vendor: form.vendor.trim(),
      receiptDate: form.date,
      amount: total,
      category: form.category,
      notes: form.notes.trim(),
      costCentre: form.costCentre.trim(),
      file: form.file,
      fileName: form.fileName || form.file?.name || "",
      items: items.length
        ? items
        : [{ description: "Main item", amount: 0, category: form.category }],
    });

    setForm({
      workspaceId: workspaces[0]?.id || "",
      vendor: "",
      date: new Date().toISOString().slice(0, 10),
      category: "Other",
      notes: "",
      costCentre: "",
      file: null,
      fileName: "",
      items: [{ id: crypto.randomUUID(), description: "", amount: 0, category: "Other" }],
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Workspace</Label>
          <Select value={form.workspaceId} onValueChange={(value) => updateField("workspaceId", value)}>
            <SelectTrigger><SelectValue placeholder="Select workspace" /></SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={(e) => updateField("date", e.target.value)} />
        </div>

        <div className="grid gap-2">
          <Label>Vendor</Label>
          <Input value={form.vendor} onChange={(e) => updateField("vendor", e.target.value)} placeholder="Supplier or store" required />
        </div>

        <div className="grid gap-2">
          <Label>Default category</Label>
          <Select value={form.category} onValueChange={(value) => updateField("category", value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Cost centre</Label>
          <Input value={form.costCentre} onChange={(e) => updateField("costCentre", e.target.value)} placeholder="Vehicles, Irrigation, Rental House" />
        </div>

        <div className="grid gap-2">
          <Label>Receipt photo</Label>
          <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                updateField("file", file);
                updateField("fileName", file?.name || "");
              }}
            />
          </Label>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="What this expense was for" />
      </div>

      <div className="grid gap-3 rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <Label>Cost items</Label>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" /> Add item
          </Button>
        </div>

        {form.items.map((item) => (
          <div key={item.id} className="grid gap-3 md:grid-cols-[1.6fr_0.7fr_0.9fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Item description" />
            </div>

            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updateItem(item.id, "amount", e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={item.category} onValueChange={(value) => updateItem(item.id, "category", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => removeItem(item.id)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="rounded-xl" disabled={busy || !form.workspaceId}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Save receipt
        </Button>
      </div>
    </form>
  );
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
  const [tab, setTab] = useState('receipts')
  const [showQuickCapture, setShowQuickCapture] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [captureState, setCaptureState] = useState({
    vendor: '',
    amount: '',
    notes: '',
    costCentre: '',
    category: 'Other',
    receiptDate: today(),
    file: null,
    previewUrl: '',
  })

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 900 : false

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
      const { data: me } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (!me) {
        const fullName = session?.user?.user_metadata?.full_name || name || session?.user?.email?.split('@')[0] || 'User'
        await supabase.from('profiles').upsert({ id: userId, full_name: fullName, role: 'Staff' })
      }

      const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(profileRow)

      const { data: membershipRows, error: membershipError } = await supabase
        .from('workspace_members')
        .select('role, workspace_id, workspaces(id, name, abn)')
        .eq('user_id', userId)
        .limit(1)

      if (membershipError) throw membershipError

      const membership = membershipRows?.[0]
      if (membership?.workspaces) {
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
      } else {
        setWorkspace(null)
        setReceipts([])
      }
    } catch (err) {
      setError(err.message || 'Could not load app data')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink() {
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

  async function handlePhotoChosen(file) {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setCaptureState((s) => ({ ...s, file, previewUrl }))
  }

  async function saveQuickReceipt() {
    if (!supabase || !session?.user || !workspace) return
    setSaving(true)
    setError('')
    try {
      let imagePath = null
      if (captureState.file) {
        const ext = captureState.file.name.split('.').pop() || 'jpg'
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('receipt-images').upload(path, captureState.file)
        if (uploadError) throw uploadError
        imagePath = path
      }

      const amount = Number(captureState.amount || 0)
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          workspace_id: workspace.id,
          submitted_by: session.user.id,
          vendor: captureState.vendor || 'Receipt',
          receipt_date: captureState.receiptDate,
          amount,
          category: captureState.category,
          notes: captureState.notes,
          status: workspace.role === 'Owner' ? 'Approved' : 'Pending',
          approved_by: workspace.role === 'Owner' ? session.user.id : null,
          cost_centre: captureState.costCentre,
          file_name: captureState.file?.name || null,
          image_path: imagePath,
        })
        .select('id')
        .single()

      if (receiptError) throw receiptError

      const { error: itemError } = await supabase.from('receipt_items').insert({
        receipt_id: receipt.id,
        description: captureState.vendor || 'Receipt item',
        amount,
        category: captureState.category,
      })
      if (itemError) throw itemError

      resetCapture()
      setShowQuickCapture(false)
      await loadAppData(session.user.id)
    } catch (err) {
      setError(err.message || 'Could not save receipt')
    } finally {
      setSaving(false)
    }
  }

  function resetCapture() {
    setCaptureState({
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

  async function approveReceipt(receiptId) {
    if (!supabase || !session?.user || workspace?.role !== 'Owner') return
    await supabase.from('receipts').update({ status: 'Approved', approved_by: session.user.id }).eq('id', receiptId)
    await loadAppData(session.user.id)
  }

  const filteredReceipts = receipts.filter((receipt) => {
    const text = `${receipt.vendor} ${receipt.notes || ''} ${receipt.cost_centre || ''}`.toLowerCase()
    const matchSearch = text.includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || receipt.status === statusFilter
    return matchSearch && matchStatus
  })

  const total = filteredReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0)
  const pending = receipts.filter((r) => r.status === 'Pending').length
  const isOwner = workspace?.role === 'Owner'
  const isSubmitter = workspace?.role === 'Submitter'

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return <div className="app-shell"><div className="card"><h2>Supabase environment variables missing</h2></div></div>
  }

  if (!session) {
    return (
      <div className="app-shell auth-shell">
        <div className="card auth-card">
          <h1>Receipt App</h1>
          <p className="muted">Simple shared receipt capture for two users.</p>
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
          <button className="primary" onClick={handleMagicLink}>Email me a sign-in link</button>
          {info ? <p className="info">{info}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`app-shell ${isMobile ? 'mobile' : ''}`}>
      <div className="top-grid">
        <div className="card">
          <h1>Receipt App</h1>
          <p className="muted">Simple shared receipt capture for two users.</p>
          <div className="top-meta">
            <span>{profile?.full_name || session.user.email}</span>
            <span>{workspace ? `${workspace.name} · ${workspace.role}` : 'No workspace linked yet'}</span>
          </div>
        </div>
        <div className="card">
          <div className="stat-row"><span>Visible total</span><strong>{money(total)}</strong></div>
          <div className="stat-row"><span>Pending</span><strong>{pending}</strong></div>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {!workspace ? (
        <div className="card">
          <h2>One-time setup still needed</h2>
          <p className="muted">Your user exists, but you have not been added to a workspace yet.</p>
        </div>
      ) : isSubmitter ? (
        <div className="phone-layout">
          <div className="card quick-card">
            <h2>Quick receipt</h2>
            <p className="muted">Take a photo and save it fast.</p>
            <label className="camera-button">
              <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChosen(e.target.files?.[0])} />
              Take photo
            </label>
            <label className="secondary-button">
              <input type="file" accept="image/*" onChange={(e) => handlePhotoChosen(e.target.files?.[0])} />
              Upload from phone
            </label>
            {captureState.previewUrl ? <img className="preview" src={captureState.previewUrl} alt="Receipt preview" /> : null}
            <input placeholder="Vendor" value={captureState.vendor} onChange={(e) => setCaptureState((s) => ({ ...s, vendor: e.target.value }))} />
            <input placeholder="Amount" type="number" step="0.01" value={captureState.amount} onChange={(e) => setCaptureState((s) => ({ ...s, amount: e.target.value }))} />
            <select value={captureState.category} onChange={(e) => setCaptureState((s) => ({ ...s, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Cost centre" value={captureState.costCentre} onChange={(e) => setCaptureState((s) => ({ ...s, costCentre: e.target.value }))} />
            <textarea placeholder="Notes" value={captureState.notes} onChange={(e) => setCaptureState((s) => ({ ...s, notes: e.target.value }))} />
            <button className="primary big" onClick={saveQuickReceipt} disabled={saving}>{saving ? 'Saving...' : 'Save receipt'}</button>
          </div>

          <div className="card">
            <h2>My recent receipts</h2>
            <div className="receipt-list compact">
              {filteredReceipts.filter((r) => r.submitted_by === session.user.id).length === 0 ? <p className="muted">No receipts yet.</p> : null}
              {filteredReceipts.filter((r) => r.submitted_by === session.user.id).map((receipt) => (
                <div key={receipt.id} className="receipt-item compact-item">
                  <div>
                    <strong>{receipt.vendor}</strong>
                    <div className="muted small">{receipt.status} · {receipt.receipt_date}</div>
                  </div>
                  <strong>{money(receipt.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="main-grid">
          <div className="left-column">
            <div className="card">
              <h2>Owner tools</h2>
              <button className="primary" onClick={() => setShowQuickCapture((v) => !v)}>{showQuickCapture ? 'Hide quick receipt' : 'Quick add receipt'}</button>
            </div>

            <div className="card">
              <h2>Filters</h2>
              <label>Search</label>
              <input placeholder="Vendor, notes, cost centre" value={search} onChange={(e) => setSearch(e.target.value)} />
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option>All</option>
                <option>Pending</option>
                <option>Approved</option>
              </select>
            </div>

            <div className="card">
              <h2>Totals by category</h2>
              <CategorySummary receipts={filteredReceipts} />
            </div>
          </div>

          <div className="right-column">
            {showQuickCapture ? (
              <div className="card">
                <h2>Quick add</h2>
                <div className="quick-inline">
                  <label className="camera-button">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoChosen(e.target.files?.[0])} />
                    Take photo
                  </label>
                  <label className="secondary-button">
                    <input type="file" accept="image/*" onChange={(e) => handlePhotoChosen(e.target.files?.[0])} />
                    Upload file
                  </label>
                </div>
                {captureState.previewUrl ? <img className="preview" src={captureState.previewUrl} alt="Receipt preview" /> : null}
                <div className="form-grid">
                  <input placeholder="Vendor" value={captureState.vendor} onChange={(e) => setCaptureState((s) => ({ ...s, vendor: e.target.value }))} />
                  <input placeholder="Amount" type="number" step="0.01" value={captureState.amount} onChange={(e) => setCaptureState((s) => ({ ...s, amount: e.target.value }))} />
                  <select value={captureState.category} onChange={(e) => setCaptureState((s) => ({ ...s, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input placeholder="Cost centre" value={captureState.costCentre} onChange={(e) => setCaptureState((s) => ({ ...s, costCentre: e.target.value }))} />
                </div>
                <textarea placeholder="Notes" value={captureState.notes} onChange={(e) => setCaptureState((s) => ({ ...s, notes: e.target.value }))} />
                <button className="primary" onClick={saveQuickReceipt} disabled={saving}>{saving ? 'Saving...' : 'Save receipt'}</button>
              </div>
            ) : null}

            <div className="card">
              <div className="tabs">
                <button className={tab === 'receipts' ? 'active' : ''} onClick={() => setTab('receipts')}>Receipts</button>
                <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
              </div>

              {tab === 'receipts' ? (
                <div className="receipt-list">
                  {filteredReceipts.length === 0 ? <p className="muted">No receipts yet.</p> : null}
                  {filteredReceipts.map((receipt) => (
                    <div key={receipt.id} className="receipt-item">
                      <div>
                        <strong>{receipt.vendor}</strong>
                        <div className="muted small">{receipt.receipt_date} · {receipt.status} · {receipt.cost_centre || 'No cost centre'}</div>
                        {receipt.notes ? <div className="muted small">{receipt.notes}</div> : null}
                      </div>
                      <div className="receipt-actions">
                        <strong>{money(receipt.amount)}</strong>
                        {receipt.status !== 'Approved' ? <button onClick={() => approveReceipt(receipt.id)}>Approve</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceSummary receipts={filteredReceipts} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkspaceSummary({ receipts }) {
  const total = receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0)
  const approved = receipts.filter((r) => r.status === 'Approved').length
  const pending = receipts.filter((r) => r.status === 'Pending').length

  return (
    <div className="summary-grid">
      <div className="summary-box"><span>Total receipts</span><strong>{receipts.length}</strong></div>
      <div className="summary-box"><span>Approved</span><strong>{approved}</strong></div>
      <div className="summary-box"><span>Pending</span><strong>{pending}</strong></div>
      <div className="summary-box"><span>Total value</span><strong>{money(total)}</strong></div>
    </div>
  )
}

function CategorySummary({ receipts }) {
  const grouped = CATEGORIES.map((category) => ({
    category,
    total: receipts
      .flatMap((receipt) => receipt.receipt_items?.length ? receipt.receipt_items : [{ category: receipt.category, amount: receipt.amount }])
      .filter((item) => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
  })).filter((row) => row.total > 0)

  if (grouped.length === 0) return <p className="muted">No totals yet.</p>

  return grouped.map((row) => (
    <div key={row.category} className="mini-row">
      <span>{row.category}</span>
      <strong>{money(row.total)}</strong>
    </div>
  ))
}
