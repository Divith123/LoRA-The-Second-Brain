"use client";

// components/memory-manager.tsx
// Personal-memory management UI for the /profile page. Talks to the real
// /api/memories backend (no mock data). Uses the existing design system.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/user-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  RefreshCw,
  Info,
} from "lucide-react";

interface Memory {
  memoryId: string;
  entity: string;
  attribute: string;
  value: string;
  source: string;
  confidence: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

type LoadState = "idle" | "loading" | "success" | "error";

function titleizeAttribute(attr: string): string {
  return attr.replace(/[_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MemoryManager() {
  const { currentUser } = useUser();
  const userId = currentUser?.id;

  const [memories, setMemories] = useState<Memory[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Add/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [formAttribute, setFormAttribute] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const apiBase = useMemo(
    () => (userId ? `/api/memories?userId=${encodeURIComponent(userId)}` : null),
    [userId]
  );

  const load = useCallback(async () => {
    if (!apiBase) return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch(apiBase, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load (HTTP ${res.status})`);
      }
      const data = await res.json();
      setMemories(Array.isArray(data.memories) ? data.memories : []);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memories");
      setState("error");
    }
  }, [apiBase]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.attribute.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q) ||
        m.entity.toLowerCase().includes(q)
    );
  }, [memories, query]);

  function openAdd() {
    setEditing(null);
    setFormAttribute("");
    setFormValue("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(m: Memory) {
    setEditing(m);
    setFormAttribute(m.attribute);
    setFormValue(m.value);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    const attribute = formAttribute.trim();
    const value = formValue.trim();
    if (!attribute) {
      setFormError("Please enter what this memory is about (e.g. 'preferred editor').");
      return;
    }
    if (!value) {
      setFormError("Please enter the value for this memory.");
      return;
    }
    if (!apiBase) return;

    setSaving(true);
    setFormError(null);
    try {
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(apiBase, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "user", attribute, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Save failed (HTTP ${res.status})`);
      }
      toast.success(editing ? "Memory updated" : "Memory added");
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save memory");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !apiBase) return;
    setDeleting(true);
    try {
      const url = `${apiBase}&entity=${encodeURIComponent(
        deleteTarget.entity
      )}&attribute=${encodeURIComponent(deleteTarget.attribute)}`;
      const res = await fetch(url, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Delete failed (HTTP ${res.status})`);
      }
      toast.success("Memory removed from AI context");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete memory");
    } finally {
      setDeleting(false);
    }
  }

  if (!userId) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Memory
            </CardTitle>
            <CardDescription>
              Facts LoRA remembers about you and uses to personalize answers.
              These take precedence over uploaded documents.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={state === "loading"}
              aria-label="Refresh memories"
            >
              <RefreshCw
                className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`}
              />
            </Button>
            <Button size="sm" onClick={openAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add memory
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search (only when there are enough memories to warrant it) */}
        {memories.length >= 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memories..."
              className="pl-9"
              aria-label="Search memories"
            />
          </div>
        )}

        {/* Loading state */}
        {state === "loading" && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-3" />
            Loading your memories...
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="py-8 text-center">
            <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {state === "success" && memories.length === 0 && (
          <div className="py-10 text-center">
            <Brain className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No memories saved yet</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
              Add facts you want LoRA to remember, like your preferred editor,
              timezone, or how you like answers formatted.
            </p>
            <Button size="sm" onClick={openAdd} className="flex items-center gap-2 mx-auto">
              <Plus className="w-4 h-4" />
              Add your first memory
            </Button>
          </div>
        )}

        {/* No search results */}
        {state === "success" &&
          memories.length > 0 &&
          filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No memories match “{query}”.
            </p>
          )}

        {/* Memory list */}
        {state === "success" && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((m) => (
              <li
                key={m.memoryId}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {titleizeAttribute(m.attribute)}
                    </span>
                    {m.version > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        v{m.version}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs capitalize">
                      {m.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 mt-1 break-words">
                    {m.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Source: {m.source} · Updated{" "}
                    {new Date(m.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(m)}
                    aria-label={`Edit ${m.attribute}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(m)}
                    aria-label={`Delete ${m.attribute}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Soft-delete disclosure */}
        {state === "success" && memories.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Deleting a memory removes it from the AI's context immediately. A
            version is retained in your private audit history (soft delete); it
            is not permanently erased from the database.
          </p>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit memory" : "Add memory"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this memory. The new value becomes the active version; the old one is kept in history but no longer used."
                : "Tell LoRA a fact to remember about you."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mem-attribute">About (attribute)</Label>
              <Input
                id="mem-attribute"
                placeholder="e.g. preferred editor"
                value={formAttribute}
                onChange={(e) => setFormAttribute(e.target.value)}
                disabled={!!editing}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">
                  The attribute can’t be changed when editing. Delete and
                  re-add to use a different attribute.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mem-value">Value</Label>
              <Input
                id="mem-value"
                placeholder="e.g. Cursor"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) handleSave();
                }}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add memory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete memory
            </DialogTitle>
            <DialogDescription>
              Remove{" "}
              <span className="font-medium">
                {deleteTarget ? titleizeAttribute(deleteTarget.attribute) : ""}
              </span>{" "}
              from the AI's context? This takes effect immediately. A copy is
              kept in your private audit history (soft delete, not permanent
              erasure).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Removing..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
