import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type ObjectInstance } from "@/lib/shrapnel-api";
import { ErrorNote, PageHeading } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/objects/")({
  head: () => ({
    meta: [
      { title: "Objects — shrapnel EAV console" },
      {
        name: "description",
        content:
          "List shrapnel object instances, decode their attribute values inline and delete instances with cascading value cleanup.",
      },
      { property: "og:title", content: "Objects — shrapnel EAV console" },
      {
        property: "og:description",
        content: "List, decode and delete shrapnel object instances.",
      },
    ],
  }),
  component: ObjectsPage,
});

function ObjectsPage() {
  const qc = useQueryClient();
  const [decode, setDecode] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const query = useQuery({
    queryKey: ["objects", decode, offset],
    queryFn: () => api.objects({ limit, offset, decode }),
    retry: false,
  });

  const rows: ObjectInstance[] = query.data?.objects ?? [];

  const remove = async (id: number) => {
    try {
      await api.deleteObject(id);
      toast.success(`Deleted object #${id}`);
      qc.invalidateQueries({ queryKey: ["objects"] });
      qc.invalidateQueries({ queryKey: ["health"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeading
        title="Objects"
        subtitle="shrapnel.object_instance — concrete instances and their decoded values."
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch id="decode" checked={decode} onCheckedChange={setDecode} />
          <Label htmlFor="decode" className="font-mono text-sm">
            ?decode=true
          </Label>
        </div>
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
              <TableHead className="w-20 font-mono text-sm">id</TableHead>
              <TableHead className="w-56 font-mono text-sm">created_at</TableHead>
              <TableHead className="font-mono text-sm">values</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        to="/objects/$id"
                        params={{ id: String(o.id) }}
                        className="font-mono text-sm text-primary hover:underline"
                      >
                        #{o.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {o.values ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(o.values).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]"
                            >
                              <span className="text-muted-foreground">{k}=</span>
                              {typeof v === "object" && v !== null
                                ? JSON.stringify(v)
                                : String(v)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="font-mono text-sm text-muted-foreground">
                          decode off
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(o.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            {!query.isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No object instances.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
