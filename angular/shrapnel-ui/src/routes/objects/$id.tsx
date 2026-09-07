import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "@/lib/shrapnel-api";
import { ErrorNote, PageHeading, TypeBadge } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/objects/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Object #${params.id} — shrapnel EAV console` },
      {
        name: "description",
        content: `Decoded JSON representation and raw field-to-value bindings for shrapnel object instance ${params.id}.`,
      },
      { property: "og:title", content: `Object #${params.id} — shrapnel EAV console` },
      {
        property: "og:description",
        content: `Decoded values and raw bindings for shrapnel object instance ${params.id}.`,
      },
    ],
  }),
  component: ObjectDetail,
});

function ObjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const numericId = Number(id);

  const decoded = useQuery({
    queryKey: ["object", numericId],
    queryFn: () => api.object(numericId),
    retry: false,
  });
  const bindings = useQuery({
    queryKey: ["object-values", numericId],
    queryFn: () => api.objectValues(numericId),
    retry: false,
  });

  const remove = async () => {
    try {
      await api.deleteObject(numericId);
      toast.success(`Deleted object #${numericId}`);
      navigate({ to: "/objects" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/objects"
        className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> objects
      </Link>

      <PageHeading
        title={`Object #${id}`}
        subtitle={
          decoded.data?.object.created_at
            ? `created ${new Date(decoded.data.object.created_at).toLocaleString()}`
            : "shrapnel.object_instance"
        }
        actions={
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 className="size-4 text-destructive" /> Delete
          </Button>
        }
      />

      {decoded.isError ? <ErrorNote error={decoded.error} /> : null}

      <section className="space-y-3">
        <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          Decoded values
        </h2>
        {decoded.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-sm leading-relaxed text-accent-foreground">
            {JSON.stringify(decoded.data?.object.values ?? {}, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          Raw bindings — object_attribute_value
        </h2>
        {bindings.isError ? <ErrorNote error={bindings.error} /> : null}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-sm">field_id</TableHead>
                <TableHead className="font-mono text-sm">property_name</TableHead>
                <TableHead className="font-mono text-sm">label</TableHead>
                <TableHead className="font-mono text-sm">type</TableHead>
                <TableHead className="font-mono text-sm">value_id</TableHead>
                <TableHead className="font-mono text-sm">bound_at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bindings.data?.values ?? []).map((b) => (
                <TableRow key={b.field_id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {b.field_id}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary">
                    {b.property_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.label ?? "—"}</TableCell>
                  <TableCell>
                    <TypeBadge code={b.field_type_code} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{b.value_id}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {b.bound_at ? new Date(b.bound_at).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!bindings.isLoading && (bindings.data?.values?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No bindings.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
