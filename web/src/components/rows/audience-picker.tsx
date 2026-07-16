import { Segmented } from "@/components/segmented";
import { UserAvatar } from "@/components/user-avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CollectionInput, User } from "@/lib/types";

type AudiencePatch = Pick<CollectionInput, "audience" | "audience_user_ids">;

/**
 * "Who gets this row?" — Everyone vs a hand-picked subset, and (when subset) the per-user toggle
 * list. Emits a patch the row editor merges into its draft.
 */
export function AudiencePicker({
  audience,
  audienceUserIds,
  users,
  onChange,
}: {
  audience: CollectionInput["audience"];
  audienceUserIds: number[];
  users: User[];
  onChange: (patch: AudiencePatch) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Who gets it?</Label>
      <Segmented
        value={audience}
        onChange={(next) =>
          onChange({ audience: next, audience_user_ids: audienceUserIds })
        }
        options={[
          { value: "everyone", label: "Everyone" },
          { value: "subset", label: "Choose people" },
        ]}
      />
      {audience === "subset" && (
        <div className="mt-2 space-y-1 rounded-lg border bg-elevated p-2">
          {users.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No users yet — import your Plex users first, or this row will
              reach nobody.
            </p>
          )}
          {users.length > 0 && audienceUserIds.length === 0 && (
            <p role="status" className="p-2 text-sm text-warning">
              Nobody is chosen, so this row won&rsquo;t reach anyone. Pick at
              least one person.
            </p>
          )}
          {users.map((user) => {
            const on = audienceUserIds.includes(user.id);
            return (
              <label
                key={user.id}
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm">
                  <UserAvatar name={user.username} size="sm" />
                  {user.username}
                </span>
                <Switch
                  checked={on}
                  onCheckedChange={(checked) =>
                    onChange({
                      audience: "subset",
                      audience_user_ids: checked
                        ? [...audienceUserIds, user.id]
                        : audienceUserIds.filter((id) => id !== user.id),
                    })
                  }
                  aria-label={user.username}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
