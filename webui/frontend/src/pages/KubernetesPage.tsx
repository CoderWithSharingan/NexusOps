import { useEffect, useState } from "react";
import { api, ApiError, type NexusConfig } from "../api/client";
import { useStatus } from "../api/StatusProvider";
import { Button } from "../components/Button";
import { CodeViewer, CommandLine } from "../components/Code";
import { GlassPanel } from "../components/GlassPanel";
import { CheckIcon } from "../components/icons";
import { useToast } from "../components/Toast";
import { getIn } from "../configPaths";
import { StagePage } from "../layout/StagePage";

const HARDENING = [
  "Runs as a non-root user (UID 10001)",
  "Read-only root filesystem",
  "All Linux capabilities dropped",
  "No privilege escalation",
  "RuntimeDefault seccomp profile",
  "Readiness and liveness probes on /health",
  "CPU and memory requests and limits",
];

export function KubernetesPage() {
  const { status, refresh } = useStatus();
  const toast = useToast();
  const [config, setConfig] = useState<NexusConfig | null>(null);
  const [manifests, setManifests] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getConfig().then(({ config }) => setConfig(config), () => setConfig(null));
  }, []);

  const name = String(getIn(config ?? {}, ["application", "name"]) ?? "app");
  const image = `${String(getIn(config ?? {}, ["container", "image_name"]) ?? name)}:${String(
    getIn(config ?? {}, ["container", "image_tag"]) ?? "latest",
  )}`;
  const replicas = Number(getIn(config ?? {}, ["deployment", "replicas"]) ?? 1);

  const render = async () => {
    setBusy(true);
    try {
      setManifests((await api.renderKubernetes()).manifests);
      void refresh();
    } catch (caught) {
      toast({ tone: "error", message: caught instanceof ApiError ? caught.message : "Could not render manifests." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <StagePage
      stage="kubernetes"
      eyebrow="Kubernetes"
      title="Deployment preview"
      intro="NexusOps writes a hardened Deployment and Service from your configuration. It never connects to a cluster."
    >
      <GlassPanel className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
        {[
          ["Replicas", String(replicas)],
          ["Image", image],
          ["Service", "port 80 → 8000"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-bg/40 p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold" title={value}>
              {value}
            </p>
          </div>
        ))}
      </GlassPanel>

      <GlassPanel className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Security built in</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {HARDENING.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted">
              <CheckIcon size={16} className="mt-0.5 shrink-0 text-ok" />
              {item}
            </li>
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Manifests</h2>
            <p className="text-xs text-muted">Written to build/kubernetes/manifests.yaml</p>
          </div>
          <Button variant="primary" onClick={render} disabled={busy || !status?.config.valid}>
            {busy ? "Rendering…" : manifests ? "Render again" : "Render manifests"}
          </Button>
        </div>
        {manifests && <CodeViewer code={manifests} title="manifests.yaml" />}
        <p className="text-sm text-muted">Deploying to a cluster is a separate, manual step:</p>
        <CommandLine command="kubectl apply -f build/kubernetes/manifests.yaml" />
      </GlassPanel>
    </StagePage>
  );
}
