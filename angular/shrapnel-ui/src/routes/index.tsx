import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Boxes, Layers, Link2, Tags } from "lucide-react";
import { api } from "@/lib/shrapnel-api";
import { ErrorNote, PageHeading, TypeBadge } from "@/components/console-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — shrapnel EAV console" },
      {
        name: "description",
        content:
          "Live health, row counts and type registry for the shrapnel Entity-Attribute-Value object store.",
      },
      { property: "og:title", content: "Overview — shrapnel EAV console" },
      {
        property: "og:description",
        content: "Live health, row counts and type registry for the shrapnel object store.",
      },
    ],
  }),
  component: Overview,
});

const CARDS = [
  { key: "field_type_count", label: "Field types", icon: Layers, to: "/fields" },
  { key: "field_count", label: "Fields", icon: Tags, to: "/fields" },
  { key: "object_count", label: "Objects", icon: Boxes, to: "/objects" },
  { key: "value_count", label: "Values", icon: Activity, to: "/objects" },
  { key: "binding_count", label: "Bindings", icon: Link2, to: "/objects" },
] as const;

function Overview() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: false });
  const types = useQuery({
    queryKey: ["field-types"],
    queryFn: api.fieldTypes,
    retry: false,
  });

  return (
    <div className="space-y-8">
      <PageHeading
        title="Overview"
        subtitle="shrapnel Relational Object Store — metadata and instance telemetry."
        actions={
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm ${
              health.isSuccess
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            <span
              className={`size-2 rounded-full ${health.isSuccess ? "bg-primary" : "bg-muted-foreground"}`}
            />
            {health.isLoading ? "probing" : (health.data?.status ?? "unreachable")}
          </span>
        }
      />

      {health.isError ? <ErrorNote error={health.error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map(({ key, label, icon: Icon, to }) => (
          <Link
            key={key}
            to={to}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <Icon className="size-4 text-muted-foreground group-hover:text-primary" />
            </div>
            {health.isLoading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
                {health.data?.counts?.[key] ?? "—"}
              </p>
            )}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
          Type registry
        </h2>
        {types.isError ? <ErrorNote error={types.error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(types.data?.field_types ?? []).map((t) => (
            <div key={t.code} className="rounded-lg border border-border bg-card p-4">
              <TypeBadge code={t.code} />
              <p className="mt-2 text-sm">{t.description}</p>
              <p className="mt-1 font-mono text-sm text-accent-foreground">{t.pg_type}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          Storage model
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Definitions live in <code className="text-accent-foreground">shrapnel.field</code>{" "}
          (keyed by <code className="text-accent-foreground">property_name</code>), instances in{" "}
          <code className="text-accent-foreground">shrapnel.object_instance</code>. Each concrete
          value writes a base <code className="text-accent-foreground">value</code> row plus a
          typed <code className="text-accent-foreground">value_&lt;type&gt;</code> extension in one
          transaction, linked through{" "}
          <code className="text-accent-foreground">object_attribute_value</code>.
        </p>
      </section>
    </div>
  );
}
