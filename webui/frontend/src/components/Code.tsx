import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2.5 py-1 text-xs text-muted
        transition hover:border-primary/70 hover:text-text"
    >
      {copied ? <CheckIcon size={14} className="text-ok" /> : <CopyIcon size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeViewer({ code, title, maxHeight = "28rem" }: { code: string; title?: string; maxHeight?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-bg/70">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-error/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
        </div>
        {title && <span className="font-mono text-xs text-muted">{title}</span>}
        <CopyButton text={code} />
      </div>
      <pre className="overflow-auto p-4 font-mono text-[13px] leading-relaxed text-text" style={{ maxHeight }} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg/60 px-3 py-2">
      <code className="overflow-x-auto font-mono text-[13px] text-text">
        <span className="select-none text-primary">&gt; </span>
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  );
}
