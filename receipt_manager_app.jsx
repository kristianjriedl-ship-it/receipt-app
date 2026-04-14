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

export default function SupabaseReceiptManagerApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [query, setQuery] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      setWorkspaces([]);
      setReceipts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setErrorMessage("");

      try {
        await ensureProfile(session.user);
        const [profileData, workspaceData, receiptData] = await Promise.all([
          loadProfile(session.user.id),
          loadWorkspaces(),
          loadReceipts(),
        ]);

        if (!cancelled) {
          setProfile(profileData);
          setWorkspaces(workspaceData);
          setReceipts(receiptData);
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error.message || "Could not load data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    const receiptChannel = supabase
      .channel("receipts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, async () => {
        const fresh = await loadReceipts();
        if (!cancelled) setReceipts(fresh);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "receipt_items" }, async () => {
        const fresh = await loadReceipts();
        if (!cancelled) setReceipts(fresh);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(receiptChannel);
    };
  }, [session?.user?.id]);

  async function ensureProfile(user) {
    if (!supabase) return;
    const fullName = user.user_metadata?.full_name || authName || user.email?.split("@")[0] || "User";

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, role: "Staff" }, { onConflict: "id" });

    if (error) throw error;
  }

  async function loadProfile(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data;
  }

  async function loadWorkspaces() {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, abn)")
      .eq("user_id", session.user.id);

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.workspaces.id,
      name: row.workspaces.name,
      abn: row.workspaces.abn,
      membershipRole: row.role,
    }));
  }

  async function loadReceipts() {
    const { data, error } = await supabase
      .from("receipts")
      .select(`
        id,
        workspace_id,
        submitted_by,
        approved_by,
        vendor,
        receipt_date,
        amount,
        category,
        notes,
        status,
        cost_centre,
        file_name,
        image_path,
        created_at,
        receipt_items(id, description, amount, category),
        workspace:workspaces(name, abn),
        submitter:profiles!receipts_submitted_by_fkey(full_name),
        approver:profiles!receipts_approved_by_fkey(full_name)
      `)
      .order("receipt_date", { ascending: false });

    if (error) throw error;

    return (data || []).map((row) => ({
      ...row,
      workspace_name: row.workspace?.name || "Unknown workspace",
      workspace_abn: row.workspace?.abn || "",
      submitted_by_name: row.submitter?.full_name || "Unknown",
      approved_by_name: row.approver?.full_name || "",
      items: row.receipt_items || [],
    }));
  }

  async function signIn() {
    setErrorMessage("");
    setInfoMessage("");

    if (!supabase) {
      setErrorMessage("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect this app.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: {
        emailRedirectTo: window.location.href,
        data: { full_name: authName || authEmail.split("@")[0] },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setInfoMessage("Check your email for the sign-in link.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function refreshData() {
    if (!supabase || !session?.user) return;
    setLoading(true);
    try {
      const [workspaceData, receiptData] = await Promise.all([loadWorkspaces(), loadReceipts()]);
      setWorkspaces(workspaceData);
      setReceipts(receiptData);
    } catch (error) {
      setErrorMessage(error.message || "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createReceipt(payload) {
    if (!supabase || !session?.user) return;
    setSaving(true);
    setErrorMessage("");

    try {
      let imagePath = null;

      if (payload.file) {
        const ext = payload.file.name.split(".").pop() || "jpg";
        const path = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("receipt-images")
          .upload(path, payload.file, { upsert: false });

        if (uploadError) throw uploadError;
        imagePath = path;
      }

      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          workspace_id: payload.workspaceId,
          submitted_by: session.user.id,
          vendor: payload.vendor,
          receipt_date: payload.receiptDate,
          amount: payload.amount,
          category: payload.category,
          notes: payload.notes,
          status: "Pending",
          cost_centre: payload.costCentre,
          file_name: payload.fileName,
          image_path: imagePath,
        })
        .select("id")
        .single();

      if (receiptError) throw receiptError;

      const items = payload.items.map((item) => ({
        receipt_id: receipt.id,
        description: item.description || "Main item",
        amount: Number(item.amount || 0),
        category: item.category || payload.category,
      }));

      const { error: itemsError } = await supabase.from("receipt_items").insert(items);
      if (itemsError) throw itemsError;

      const fresh = await loadReceipts();
      setReceipts(fresh);
      setDialogOpen(false);
    } catch (error) {
      setErrorMessage(error.message || "Could not save receipt.");
    } finally {
      setSaving(false);
    }
  }

  async function approveReceipt(receiptId) {
    if (!supabase || !session?.user) return;
    try {
      const { error } = await supabase
        .from("receipts")
        .update({ status: "Approved", approved_by: session.user.id })
        .eq("id", receiptId);

      if (error) throw error;
      const fresh = await loadReceipts();
      setReceipts(fresh);
    } catch (error) {
      setErrorMessage(error.message || "Could not approve receipt.");
    }
  }

  async function getSignedImageUrl(path) {
    if (!supabase || !path) return "";
    const { data, error } = await supabase.storage.from("receipt-images").createSignedUrl(path, 3600);
    if (error) return "";
    return data.signedUrl;
  }

  const filtered = useMemo(() => {
    return receipts.filter((receipt) => {
      const haystack = [
        receipt.vendor,
        receipt.notes,
        receipt.file_name,
        receipt.cost_centre,
        receipt.workspace_name,
        receipt.submitted_by_name,
        ...(receipt.items || []).map((item) => item.description),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesWorkspace = workspaceFilter === "all" || receipt.workspace_id === workspaceFilter;
      const matchesStatus = statusFilter === "all" || receipt.status === statusFilter;
      return matchesQuery && matchesWorkspace && matchesStatus;
    });
  }, [receipts, query, workspaceFilter, statusFilter]);

  const total = useMemo(() => filtered.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0), [filtered]);
  const pendingCount = useMemo(() => receipts.filter((receipt) => receipt.status === "Pending").length, [receipts]);

  const totalsByCategory = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        total: filtered.reduce((sum, receipt) => {
          const itemTotal = (receipt.items || [])
            .filter((item) => item.category === category)
            .reduce((acc, item) => acc + Number(item.amount || 0), 0);
          return sum + itemTotal;
        }, 0),
      }))
      .filter((row) => row.total > 0);
  }, [filtered]);

  const totalsByWorkspace = useMemo(() => {
    return workspaces.map((workspace) => ({
      ...workspace,
      total: filtered
        .filter((receipt) => receipt.workspace_id === workspace.id)
        .reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0),
      pending: filtered.filter((receipt) => receipt.workspace_id === workspace.id && receipt.status === "Pending").length,
    }));
  }, [filtered, workspaces]);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Supabase setup required</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-slate-600">
                Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to run the shared cloud version.
              </p>
              <div className="rounded-2xl bg-slate-100 p-4">
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{SETUP_SQL}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="mx-auto max-w-xl">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <LogIn className="h-6 w-6" /> Sign in to receipt workspace
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <Button onClick={signIn} className="rounded-xl">
                <LogIn className="mr-2 h-4 w-4" /> Email me a sign-in link
              </Button>
              {infoMessage ? <p className="text-sm text-emerald-700">{infoMessage}</p> : null}
              {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                This version uses Supabase Auth, Postgres, Storage, and live updates.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Building2 className="h-6 w-6" /> Shared Tax Receipt Workspace
              </CardTitle>
              <p className="text-sm text-slate-600">
                Live multi-user receipt capture backed by Supabase auth, database, and storage.
              </p>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="flex h-full items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Visible total</p>
                <p className="text-3xl font-semibold">{currency(total)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-slate-400" />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="flex h-full items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">Pending approvals</p>
                <p className="text-3xl font-semibold">{pendingCount}</p>
              </div>
              <Shield className="h-10 w-10 text-slate-400" />
            </CardContent>
          </Card>
        </motion.div>

        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

        <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-6">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" /> Account
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                  Signed in as <span className="font-medium text-slate-900">{profile?.full_name || session.user.email}</span>
                  <br />
                  {session.user.email}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={refreshData}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </Button>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl" disabled={!workspaces.length}>
                      <Plus className="mr-2 h-4 w-4" /> Add receipt
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Submit receipt</DialogTitle>
                    </DialogHeader>
                    <ReceiptForm workspaces={workspaces} onSubmit={createReceipt} busy={saving} />
                  </DialogContent>
                </Dialog>

                {!workspaces.length ? (
                  <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    This user is not a member of any workspace yet. Add a row in <code>workspace_members</code> to grant access.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vendor, notes, items, workspace..." />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Workspace</Label>
                  <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All workspaces</SelectItem>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="outline" className="rounded-xl" onClick={() => downloadCsv(filtered)}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Totals by category</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {totalsByCategory.length === 0 ? (
                  <p className="text-sm text-slate-500">No matching items.</p>
                ) : (
                  totalsByCategory.map((row) => (
                    <div key={row.category} className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm">
                      <span>{row.category}</span>
                      <span className="font-medium">{currency(row.total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Tabs defaultValue="receipts" className="grid gap-4">
              <TabsList className="grid w-full grid-cols-2 rounded-2xl">
                <TabsTrigger value="receipts">Receipts</TabsTrigger>
                <TabsTrigger value="summary">Workspace summary</TabsTrigger>
              </TabsList>

              <TabsContent value="receipts" className="mt-0">
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Shared receipts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {loading ? (
                      <div className="flex items-center gap-2 rounded-2xl border p-10 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading receipts...
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-10 text-center text-slate-500">No receipts found.</div>
                    ) : (
                      filtered.map((receipt) => (
                        <ReceiptCard
                          key={receipt.id}
                          receipt={receipt}
                          canApprove={receipt.status !== "Approved"}
                          onApprove={() => approveReceipt(receipt.id)}
                          getSignedImageUrl={getSignedImageUrl}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-0">
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Compiled business view</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {totalsByWorkspace.map((workspace) => (
                      <div key={workspace.id} className="rounded-2xl border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">{workspace.name}</p>
                            <p className="text-sm text-slate-500">ABN / tax entity: {workspace.abn || "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-semibold">{currency(workspace.total)}</p>
                            <p className="text-sm text-slate-500">{workspace.pending} pending</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ReceiptCard({ receipt, canApprove, onApprove, getSignedImageUrl }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (!receipt.image_path) return;
    getSignedImageUrl(receipt.image_path).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [receipt.image_path, getSignedImageUrl]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 rounded-2xl border bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr_auto] md:items-start">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{receipt.vendor}</p>
            <Badge variant="outline" className={statusTone(receipt.status)}>{receipt.status}</Badge>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{receipt.category}</span>
          </div>

          <p className="text-sm text-slate-600">{receipt.notes || "No notes added"}</p>

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {receipt.workspace_name}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {receipt.receipt_date}</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {receipt.submitted_by_name}</span>
            <span className="inline-flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> {receipt.cost_centre || "No cost centre"}</span>
            <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {receipt.items.length} item(s)</span>
          </div>
        </div>

        <div className="text-left md:text-right">
          <p className="text-xl font-semibold">{currency(receipt.amount)}</p>
          <p className="text-xs text-slate-500">Approved by {receipt.approved_by_name || "—"}</p>
        </div>

        <div className="flex justify-start md:justify-end">
          {canApprove ? (
            <Button className="rounded-xl" onClick={onApprove}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" disabled>
              Approved
            </Button>
          )}
        </div>
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={receipt.vendor} className="max-h-72 rounded-2xl border object-contain" />
      ) : null}

      <div className="grid gap-2 rounded-2xl bg-slate-50 p-3">
        <p className="text-sm font-medium">Cost items</p>
        {receipt.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{item.description}</p>
              <p className="text-xs text-slate-500">{item.category}</p>
            </div>
            <p className="font-medium">{currency(item.amount)}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
