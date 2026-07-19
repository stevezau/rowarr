import { Check, Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage, apiUrl } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import {
  useApiToken,
  useCreateApiToken,
  useRevokeApiToken,
} from "@/lib/queries";

/** A copy-to-clipboard button that flips to a check for a moment. */
function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * Generate a personal API token so scripts can call Shortlist's API without the browser login.
 * The plaintext is shown exactly once (only its hash is stored); regenerating or revoking
 * invalidates the old one immediately.
 */
export function ApiAccessCard() {
  const status = useApiToken();
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();
  // The freshly-minted token, shown once right after generating. Cleared on revoke.
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const enabled = status.data?.enabled ?? false;
  const exampleUrl = apiUrl("/api/runs");

  const generate = () => {
    create.mutate(undefined, {
      onSuccess: (result) => setFreshToken(result.token),
    });
  };

  return (
    <section aria-labelledby="api-access-heading" className="space-y-3">
      <h2 id="api-access-heading" className="text-lg font-semibold">
        API access
      </h2>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Generate a personal token to call Shortlist’s API from a script.
            <br />
            Send it as a header:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            .
            <br />
            The token has the same full access you do, so keep it secret — treat
            it like a password.
          </p>

          {/* The one-time reveal, right after generating. */}
          {freshToken && (
            <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">
                Copy your token now — it won’t be shown again.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
                  {freshToken}
                </code>
                <CopyButton value={freshToken} label="Copy token" />
              </div>
            </div>
          )}

          {status.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : enabled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A token is active
                {status.data?.hint && (
                  <>
                    {" "}
                    (ends in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {status.data.hint}
                    </code>
                    )
                  </>
                )}
                {status.data?.created_at && (
                  <span title={formatDate(status.data.created_at)}>
                    , created {timeAgo(status.data.created_at)}
                  </span>
                )}
                .
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={generate}
                  loading={create.isPending}
                >
                  {!create.isPending && <RefreshCw aria-hidden="true" />}
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    revoke.mutate(undefined, {
                      onSuccess: () => setFreshToken(null),
                    })
                  }
                  loading={revoke.isPending}
                >
                  {!revoke.isPending && <Trash2 aria-hidden="true" />}
                  Revoke
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating replaces the current token; revoking turns it off.
                Either way, any script still using the old token stops working
                right away.
              </p>
            </div>
          ) : (
            <Button onClick={generate} loading={create.isPending}>
              {!create.isPending && <KeyRound aria-hidden="true" />}
              Generate token
            </Button>
          )}

          {(create.isError || revoke.isError) && (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(
                create.error ?? revoke.error,
                "Something went wrong. Try again.",
              )}
            </p>
          )}

          {/* A ready-to-run example so it's obvious how to use the token. */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Example</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
                curl -H "Authorization: Bearer &lt;token&gt;" {exampleUrl}
              </code>
              <CopyButton
                value={`curl -H "Authorization: Bearer <token>" ${exampleUrl}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
