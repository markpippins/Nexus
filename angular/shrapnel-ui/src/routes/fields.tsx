import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api, TYPE_LIST, type ShrapnelField } from "@/lib/shrapnel-api";
import { ErrorNote, PageHeading, TypeBadge } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/fields")({
  head: () => ({
    meta: [
      { title: "Fields — shrapnel EAV console" },
      {
        name: "description",
        content:
          "Browse, filter and upsert shrapnel field metadata keyed by property_name across the seven field types.",
      },
      { property: "og:title", content: "Fields — shrapnel EAV console" },
      {
        property: "og:description",
        content: "Browse, filter and upsert shrapnel field metadata by property_name.",
      },
    ],
  }),
  component: FieldsPage,
});

function CreateFieldDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    property_name: "",
    name: "",
    label: "",
    type: "String",
    field_index: "0",
    is_calculated: false,
  });

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.createField({
        property_name: form.property_name.trim(),
        name: form.name.trim() || undefined,
        label: form.label.trim() || undefined,
        type: form.type,
        field_index: Number(form.field_index) || 0,
        is_calculated: form.is_calculated,
      });
      toast.success(`Upserted field #${res.field.id} (${res.field.property_name})`);
      qc.invalidateQueries({ queryKey: ["fields"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New field
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upsert field</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pn">property_name *</Label>
            <Input
              id="pn"
              className="font-mono"
              placeholder="first_name"
              value={form.property_name}
              onChange={(e) => setForm({ ...form, property_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nm">name</Label>
            <Input
              id="nm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lb">label</Label>
            <Input
              id="lb"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_LIST.map((t) => (
                  <SelectItem key={t.code} value={t.name} className="font-mono">
                    {t.code} · {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fi">field_index</Label>
            <Input
              id="fi"
              type="number"
              value={form.field_index}
              onChange={(e) => setForm({ ...form, field_index: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={form.is_calculated}
              onCheckedChange={(v) => setForm({ ...form, is_calculated: v === true })}
            />
            is_calculated
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !form.property_name.trim()}>
            {busy ? "Posting…" : "POST /api/fields"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldsPage() {
  const [typeCode, setTypeCode] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const query = useQuery({
    queryKey: ["fields", typeCode, offset],
    queryFn: () =>
      api.fields({
        limit,
        offset,
        ...(typeCode === "all" ? {} : { type_code: Number(typeCode) }),
      }),
    retry: false,
  });

  const rows: ShrapnelField[] = query.data?.fields ?? [];

  return (
    <div className="space-y-5">
      <PageHeading
        title="Fields"
        subtitle="shrapnel.field — attribute definitions, upserted by property_name."
        actions={<CreateFieldDialog />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={typeCode}
          onValueChange={(v) => {
            setTypeCode(v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-56 font-mono text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_LIST.map((t) => (
              <SelectItem key={t.code} value={String(t.code)}>
                {t.code} · {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-mono text-sm text-muted-foreground">
          offset {offset} · limit {limit}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length < limit}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>

      {query.isError ? <ErrorNote error={query.error} /> : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 font-mono text-sm">id</TableHead>
              <TableHead className="font-mono text-sm">property_name</TableHead>
              <TableHead className="font-mono text-sm">name</TableHead>
              <TableHead className="font-mono text-sm">label</TableHead>
              <TableHead className="font-mono text-sm">type</TableHead>
              <TableHead className="font-mono text-sm">idx</TableHead>
              <TableHead className="font-mono text-sm">calc</TableHead>
              <TableHead className="font-mono text-sm">updated_at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {f.id}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-primary">
                      {f.property_name}
                    </TableCell>
                    <TableCell className="text-sm">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.label ?? "—"}
                    </TableCell>
                    <TableCell>
                      <TypeBadge code={f.field_type_code} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{f.field_index}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {f.is_calculated ? "true" : "false"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {f.updated_at ? new Date(f.updated_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
            {!query.isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No fields returned.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
