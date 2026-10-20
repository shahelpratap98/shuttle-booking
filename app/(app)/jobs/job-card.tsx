"use client";

import { useState } from "react";

// The booking sheet's "Driver" tab: a job card as plain text, one
// "Label-Value" line per field, ready to paste into WhatsApp or a text.
// It can be changed before it's sent (a note for the driver, a corrected
// detail); that changes the message only, not the booking.
export function JobCard({ text, whatsappTo, driverName }: { text: string; whatsappTo: string | null; driverName: string | null }) {
  const [card, setCard] = useState(text);
  const [copied, setCopied] = useState(false);
  const edited = card !== text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (old browser, no permission): select the text instead.
      (document.getElementById("job-card-text") as HTMLTextAreaElement | null)?.select();
    }
  };

  const wa = `https://wa.me/${whatsappTo ?? ""}?text=${encodeURIComponent(card)}`;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="job-card-text" className="sr-only">Job card text</label>
      <textarea
        id="job-card-text"
        value={card}
        onChange={(e) => setCard(e.target.value)}
        rows={Math.min(22, card.split("\n").length + 1)}
        className="field font-sans text-[13px] leading-relaxed"
      />
      <p className="-mt-1 text-xs text-muted">
        You can change the card before sending it. That changes the message only; to change the booking itself, press Edit at the top.
      </p>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={copy} className="btn btn-sm btn-quiet" aria-live="polite">
          {copied ? "Copied" : "Copy job card"}
        </button>
        <a href={wa} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">
          {whatsappTo && driverName ? `Send to ${driverName.split(" ")[0]} on WhatsApp` : "Send on WhatsApp"}
        </a>
        {edited ? (
          <button type="button" onClick={() => setCard(text)} className="btn btn-sm btn-quiet">
            Undo my changes
          </button>
        ) : null}
      </div>
      {!whatsappTo && driverName ? <p className="text-xs text-muted">Add {driverName.split(" ")[0]}&rsquo;s mobile under Team to send it straight to them.</p> : null}
    </div>
  );
}
