import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type NexusConfig } from "../api/client";
import { useStatus } from "../api/StatusProvider";
import { Button } from "../components/Button";
import { GlassPanel } from "../components/GlassPanel";
import { useToast } from "../components/Toast";
import { getIn, setIn } from "../configPaths";
import { StagePage } from "../layout/StagePage";

type Kind = "text" | "replicas" | "switch" | "select";

type Field = {
  path: string[];
  label: string;
  kind: Kind;
  help?: string;
  options?: string[];
  placeholder?: string;
  list?: string;
  // Substrings of backend validation messages that belong to this field.
  errorKeys: string[];
  visible?: (config: NexusConfig) => boolean;
};

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "eu-west-1", "eu-west-2", "eu-central-1",
  "eu-north-1", "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
];

const SECTIONS: { title: string; description: string; fields: Field[] }[] = [
  {
    title: "Application",
    description: "The name is reused for the Docker image and Kubernetes resources.",
    fields: [
      {
        path: ["application", "name"],
        label: "Application name",
        kind: "text",
        placeholder: "payment-api",
        help: "Lowercase letters, digits and hyphens.",
        errorKeys: ["application.name", "container.image_name", "'application'"],
      },
    ],
  },
  {
    title: "AWS",
    description: "Where infrastructure will be created.",
    fields: [
      {
        path: ["infrastructure", "region"],
        label: "Region",
        kind: "text",
        list: "aws-regions",
        placeholder: "ap-south-1",
        errorKeys: ["infrastructure.region", "AWS only", "'infrastructure'"],
      },
    ],
  },
  {
    title: "Container",
    description: "How the local Docker image is built and tagged.",
    fields: [
      {
        path: ["container", "image_tag"],
        label: "Image tag",
        kind: "text",
        placeholder: "latest",
        help: "Use a unique tag such as v1.2.0 when ECR tags are IMMUTABLE.",
        errorKeys: ["container.image_tag"],
      },
      {
        path: ["container", "build_context"],
        label: "Build context",
        kind: "text",
        placeholder: "app/backend",
        help: "Folder inside the project.",
        errorKeys: ["container.build_context"],
      },
      {
        path: ["container", "dockerfile"],
        label: "Dockerfile",
        kind: "text",
        placeholder: "Dockerfile",
        errorKeys: ["container.dockerfile"],
      },
    ],
  },
  {
    title: "Deployment",
    description: "How many copies of the app Kubernetes should run.",
    fields: [
      { path: ["deployment", "replicas"], label: "Replicas", kind: "replicas", errorKeys: ["deployment.replicas", "'deployment'"] },
      {
        path: ["deployment", "image"],
        label: "Cluster image (optional)",
        kind: "text",
        placeholder: "123456789012.dkr.ecr.ap-south-1.amazonaws.com/payment-api:v1",
        help: "Full image the cluster pulls, such as your ECR image. Leave empty to use the local image name.",
        errorKeys: ["deployment.image"],
      },
    ],
  },
  {
    title: "S3 bucket",
    description: "Optional private, encrypted bucket.",
    fields: [
      { path: ["resources", "s3", "enabled"], label: "Create an S3 bucket", kind: "switch", errorKeys: ["s3.enabled", "'resources.s3'"] },
      {
        path: ["resources", "s3", "bucket_name"],
        label: "Bucket name",
        kind: "text",
        help: "Must be globally unique: 3–63 lowercase letters, digits, dots or hyphens.",
        errorKeys: ["bucket_name"],
        visible: (config) => getIn(config, ["resources", "s3", "enabled"]) === true,
      },
    ],
  },
  {
    title: "ECR repository",
    description: "Optional private registry for your image.",
    fields: [
      { path: ["resources", "ecr", "enabled"], label: "Create an ECR repository", kind: "switch", errorKeys: ["ecr.enabled", "'resources.ecr'", "Unsupported 'resources.ecr'"] },
      { path: ["resources", "ecr", "repository_name"], label: "Repository name", kind: "text", errorKeys: ["repository_name"] },
      {
        path: ["resources", "ecr", "image_tag_mutability"],
        label: "Tag mutability",
        kind: "select",
        options: ["IMMUTABLE", "MUTABLE"],
        help: "IMMUTABLE stops a tag from being overwritten.",
        errorKeys: ["image_tag_mutability"],
      },
      { path: ["resources", "ecr", "scan_on_push"], label: "Scan images on push", kind: "switch", errorKeys: ["scan_on_push"] },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);

export function assignErrors(errors: string[]) {
  const byField: Record<string, string[]> = {};
  const general: string[] = [];
  for (const error of errors) {
    const field = ALL_FIELDS.find((each) => each.errorKeys.some((key) => error.includes(key)));
    if (field) (byField[field.path.join(".")] ??= []).push(error);
    else general.push(error);
  }
  return { byField, general };
}

function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300
        ${checked ? "border-transparent bg-gradient-to-r from-primary to-secondary" : "border-line bg-surface"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow ${checked ? "right-0.5" : "left-0.5"}`}
      />
    </button>
  );
}

const inputClass = (invalid: boolean) =>
  `w-full rounded-xl border bg-bg/60 px-3 py-2 font-mono text-sm text-text outline-none transition
   placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/30 ${invalid ? "border-error" : "border-line"}`;

export function ConfigPage() {
  const { refresh } = useStatus();
  const toast = useToast();
  const [saved, setSaved] = useState<NexusConfig | null>(null);
  const [draft, setDraft] = useState<NexusConfig | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    api
      .getConfig()
      .then(({ config }) => {
        setSaved(config);
        setDraft(config);
      })
      .catch((caught) => setLoadError(caught instanceof ApiError ? caught.message : "Could not load the configuration."));
  }, []);

  useEffect(() => {
    if (!draft) return;
    const id = ++requestId.current;
    setChecking(true);
    const timer = window.setTimeout(() => {
      api
        .validate(draft)
        .then((result) => id === requestId.current && setErrors(result.errors))
        .catch((caught) => id === requestId.current && setErrors(caught instanceof ApiError ? caught.errors : []))
        .finally(() => id === requestId.current && setChecking(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const { byField, general } = useMemo(() => assignErrors(errors), [errors]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.saveConfig(draft);
      setSaved(draft);
      toast({ tone: "ok", message: "Saved nexusops.yaml. The previous version was kept as nexusops.yaml.bak." });
      void refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) setErrors(caught.errors);
      toast({ tone: "error", message: caught instanceof ApiError ? caught.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const update = (path: string[], value: unknown) => setDraft((current) => (current ? setIn(current, path, value) : current));

  return (
    <StagePage
      stage="yaml"
      eyebrow="nexusops.yaml"
      title="Configuration"
      intro="Every NexusOps step reads these settings. Changes are checked as you type and only saved when they are valid."
    >
      {loadError && (
        <GlassPanel className="p-6 text-error" role="alert">
          {loadError}
        </GlassPanel>
      )}
      {draft && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <datalist id="aws-regions">
            {AWS_REGIONS.map((region) => (
              <option key={region} value={region} />
            ))}
          </datalist>
          {SECTIONS.map((section) => (
            <GlassPanel key={section.title} className="p-5 sm:p-6">
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-1">
                  <span className="text-base font-semibold">{section.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{section.description}</span>
                </legend>
                {section.fields
                  .filter((field) => !field.visible || field.visible(draft))
                  .map((field) => {
                    const id = field.path.join(".");
                    const value = getIn(draft, field.path);
                    const fieldErrors = byField[id] ?? [];
                    const describedBy = [field.help && `${id}-help`, fieldErrors.length && `${id}-error`].filter(Boolean).join(" ");
                    return (
                      <div key={id} className="flex flex-col gap-1.5">
                        {field.kind === "switch" ? (
                          <div className="flex items-center justify-between gap-4">
                            <label htmlFor={id} className="text-sm font-medium">
                              {field.label}
                            </label>
                            <Switch id={id} label={field.label} checked={value === true} onChange={(next) => update(field.path, next)} />
                          </div>
                        ) : (
                          <>
                            <label htmlFor={id} className="text-sm font-medium">
                              {field.label}
                            </label>
                            {field.kind === "select" ? (
                              <select
                                id={id}
                                value={String(value ?? field.options?.[0])}
                                onChange={(event) => update(field.path, event.target.value)}
                                className={inputClass(fieldErrors.length > 0)}
                                aria-invalid={fieldErrors.length > 0}
                                aria-describedby={describedBy || undefined}
                              >
                                {field.options?.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            ) : field.kind === "replicas" ? (
                              <div className="flex items-center gap-4">
                                <input
                                  type="range"
                                  min={1}
                                  max={20}
                                  value={typeof value === "number" ? value : 1}
                                  onChange={(event) => update(field.path, Number(event.target.value))}
                                  className="flex-1 accent-[var(--nx-primary)]"
                                  aria-label={`${field.label} slider`}
                                />
                                <input
                                  id={id}
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={typeof value === "number" ? value : String(value ?? "")}
                                  onChange={(event) =>
                                    update(field.path, event.target.value === "" ? "" : Number(event.target.value))
                                  }
                                  className={`${inputClass(fieldErrors.length > 0)} w-24`}
                                  aria-invalid={fieldErrors.length > 0}
                                  aria-describedby={describedBy || undefined}
                                />
                              </div>
                            ) : (
                              <input
                                id={id}
                                type="text"
                                value={String(value ?? "")}
                                placeholder={field.placeholder}
                                list={field.list}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(event) => update(field.path, event.target.value)}
                                className={inputClass(fieldErrors.length > 0)}
                                aria-invalid={fieldErrors.length > 0}
                                aria-describedby={describedBy || undefined}
                              />
                            )}
                          </>
                        )}
                        {field.help && (
                          <p id={`${id}-help`} className="text-xs text-muted">
                            {field.help}
                          </p>
                        )}
                        <AnimatePresence>
                          {fieldErrors.length > 0 && (
                            <motion.p
                              id={`${id}-error`}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-xs text-error"
                            >
                              {fieldErrors.join(" ")}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </fieldset>
            </GlassPanel>
          ))}

          {general.length > 0 && (
            <GlassPanel className="border-error/50 p-5" role="alert">
              <p className="text-sm font-semibold text-error">Other problems</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-error">
                {general.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </GlassPanel>
          )}

          <GlassPanel className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted" aria-live="polite">
              {checking
                ? "Checking…"
                : errors.length
                  ? `${errors.length} problem${errors.length > 1 ? "s" : ""} to fix before saving`
                  : dirty
                    ? "All settings are valid. Comments in nexusops.yaml are kept, and a backup is saved."
                    : "No unsaved changes."}
            </p>
            <div className="flex gap-2">
              <Button disabled={!dirty || saving} onClick={() => setDraft(saved)}>
                Reset
              </Button>
              <Button type="submit" variant="primary" disabled={!dirty || saving || checking || errors.length > 0}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </GlassPanel>
        </form>
      )}
    </StagePage>
  );
}
