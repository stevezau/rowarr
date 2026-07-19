import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, apiErrorMessage } from "@/lib/api";

/** A one-click "copy diagnostics" for bug reports: version, DB migration head, connection status
 *  (yes/no — never keys), record counts, and scheduled jobs. Secrets never appear in the bundle. */
export function DiagnosticsCard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    setError(null);
    try {
      const bundle = await api.getDebugBundle();
      await navigator.clipboard.writeText(bundle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn’t copy the diagnostics."));
    }
  };

  return (
    <section aria-labelledby="diagnostics-heading" className="space-y-3">
      <h2 id="diagnostics-heading" className="text-lg font-semibold">
        Diagnostics
      </h2>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">
            A plain-text summary of your setup — version, database status,
            scheduled jobs, and which connections are set up.
            <br />
            It says yes/no per connection and never includes your keys. Paste it
            into a bug report to help us help you faster.
          </p>
          <Button variant="outline" onClick={copy}>
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy diagnostics"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
