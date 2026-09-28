"use client";

import { useState } from "react";

// The booking sheet's "Driver" tab: a job card as plain text, one
// "Label-Value" line per field, ready to paste into WhatsApp or a text.
export function JobCard({ text, whatsappTo, driverName }: { text: string; whatsappTo: string | null; driverName: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (old browser, no permission): select the text instead.
      const pre = document.getElementById("job-card-text");
      if (pre) window.getSelection()?.selectAllChildren(pre);
    }
  };

  const wa = `https://wa.me/${whatsappTo ?? ""}?text=${encodeURIComponent(text)}`;

  return (
    <div className="flex flex-col gap-3">
      <pre id="job-card-text" className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={copy} className="btn btn-sm btn-quiet" aria-live="polite">
          {copied ? "Copied" : "Copy job card"}
        </button>
        <a href={wa} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
          {whatsappTo && driverName ? `Send to ${driverName.split(" ")[0]} on WhatsApp` : "Send on WhatsApp"}
        </a>
      </div>
      {!whatsappTo && driverName ? <p className="text-xs text-muted">Add {driverName.split(" ")[0]}&rsquo;s mobile under Team to send it straight to them.</p> : null}
    </div>
  );
}
