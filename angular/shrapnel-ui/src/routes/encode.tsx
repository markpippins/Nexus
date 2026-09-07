import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Play } from "lucide-react";
import { api } from "@/lib/shrapnel-api";
import { ErrorNote, PageHeading } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/encode")({
  head: () => ({
    meta: [
      { title: "Encode — shrapnel EAV console" },
      {
        name: "description",
        content:
          "Send encode payloads to the shrapnel store with explicit field specs or inferred types, and inspect the round-trip decoded result.",
      },
      { property: "og:title", content: "Encode — shrapnel EAV console" },
      {
        property: "og:description",
        content: "Encode payloads into the shrapnel store and verify the round-trip decode.",
      },
    ],
  }),
  component: EncodePage,
});

const SAMPLE_EXPLICIT = `{
  "fields": [
    { "property_name": "name", "label": "Full Name", "name": "Name", "type": "String" },
    { "property_name": "age", "label": "User Age", "name": "Age", "type": "Long" }
  ],
  "values": { "name": "Alice", "age": 30 }
}`;

const SAMPLE_INFERRED = `{
  "name": "Alice",
  "age": 30,
  "active": true,
  "score": 95.5,
  "registered_at": "2026-01-15T08:30:00.000Z",
  "metadata": { "role": "admin" }
}`;

function EncodePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [endpoint, setEndpoint] = useState("encode");
  const [body, setBody] = useState(SAMPLE_EXPLICIT);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      setError("Body is not valid JSON");
      setBusy(false);
      return;
    }
    try {
      const res =
        endpoint === "encode" ? await api.encode(parsed) : await api.createObject(parsed);
      setResult(res);
      toast.success(`Created object #${res.object_id}`);
      qc.invalidateQueries({ queryKey: ["objects"] });
      qc.invalidateQueries({ queryKey: ["fields"] });
      qc.invalidateQueries({ queryKey: ["health"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const objectId = (result as { object_id?: number } | null)?.object_id;

  return (
    <div className="space-y-5">
      <PageHeading
        title="Encode"
        subtitle="Write a payload through the transactional encoder: field upsert → object_instance → value + value_<type> → binding."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={endpoint} onValueChange={setEndpoint}>
              <TabsList className="font-mono text-sm">
                <TabsTrigger value="encode">POST /api/encode</TabsTrigger>
                <TabsTrigger value="objects">POST /api/objects</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBody(SAMPLE_EXPLICIT)}>
                Explicit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBody(SAMPLE_INFERRED)}>
                Inferred
              </Button>
            </div>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="min-h-[420px] bg-card font-mono text-sm leading-relaxed"
          />
          <Button onClick={run} disabled={busy}>
            <Play className="size-4" /> {busy ? "Sending…" : "Send request"}
          </Button>
        </div>

        <div className="space-y-3">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
            Response
          </h2>
          {error ? <ErrorNote error={error} /> : null}
          <pre className="min-h-[420px] overflow-auto rounded-lg border border-border bg-card p-4 font-mono text-sm leading-relaxed text-accent-foreground">
            {result ? JSON.stringify(result, null, 2) : "// awaiting request"}
          </pre>
          {objectId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/objects/$id", params: { id: String(objectId) } })}
            >
              Inspect object #{objectId}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
