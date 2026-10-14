// app/api/memories/route.ts
// Personal-memory management API (list + create).
//
// Session model: this project authenticates client-side (IndexedDB users) and
// passes the current user's id to server routes, exactly like app/api/files.
// We follow that established convention and scope every operation to the given
// userId. NOTE: this userId is caller-supplied and therefore only as strong as
// the existing app's trust model; this route does not weaken it further, but it
// is not a substitute for real server-side auth (tracked as a known limitation).

import { NextRequest, NextResponse } from "next/server";
import {
  getActiveMemories,
  createMemory,
  updateMemory,
  removeMemory,
  getActiveRecord,
  getMemoryHistory,
  type MemoryRecord,
} from "@/lib/server/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FIELD = 500; // chars; keep memory records small and structured
const MAX_VALUE = 2000;

function requireUserId(req: NextRequest): string | null {
  const id = new URL(req.url).searchParams.get("userId");
  return id && id.trim() ? id.trim() : null;
}

// Strip internal columns from the API surface. We expose version/status/source
// (useful for the UI) but never leak raw DB internals beyond the documented set.
function toPublic(m: MemoryRecord) {
  return {
    memoryId: m.memory_id,
    entity: m.entity,
    attribute: m.attribute,
    value: m.value,
    source: m.source,
    confidence: m.confidence,
    status: m.status,
    version: m.version,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

// GET /api/memories?userId=...        -> active memories
// GET /api/memories?userId=...&history=1&entity=user&attribute=preferred_editor
export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const wantHistory = searchParams.get("history") === "1";

  try {
    if (wantHistory) {
      const entity = searchParams.get("entity")?.trim();
      const attribute = searchParams.get("attribute")?.trim();
      if (!entity || !attribute) {
        return NextResponse.json(
          { error: "entity and attribute are required for history" },
          { status: 400 }
        );
      }
      const history = getMemoryHistory(userId, entity, attribute);
      return NextResponse.json({ history: history.map(toPublic) }, { status: 200 });
    }

    const memories = getActiveMemories(userId);
    return NextResponse.json({ memories: memories.map(toPublic) }, { status: 200 });
  } catch (err) {
    console.error("[api/memories GET] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to list memories" }, { status: 500 });
  }
}

// POST /api/memories?userId=...   body: { entity, attribute, value, confidence? }
export async function POST(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate + sanitize.
  const entity = typeof body?.entity === "string" ? body.entity.trim() : "user";
  const attribute = typeof body?.attribute === "string" ? body.attribute.trim() : "";
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const confidence =
    typeof body?.confidence === "number" ? body.confidence : undefined;

  if (!attribute) {
    return NextResponse.json({ error: "attribute is required" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  if (entity.length > MAX_FIELD || attribute.length > MAX_FIELD) {
    return NextResponse.json(
      { error: `entity/attribute must be <= ${MAX_FIELD} chars` },
      { status: 400 }
    );
  }
  if (value.length > MAX_VALUE) {
    return NextResponse.json(
      { error: `value must be <= ${MAX_VALUE} chars` },
      { status: 400 }
    );
  }

  try {
    const rec = createMemory({
      userId,
      entity,
      attribute,
      value,
      source: "profile-ui",
      confidence,
    });
    return NextResponse.json({ memory: toPublic(rec) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create memory";
    // Friendly conflict messages for the two expected refusals.
    if (/already exists/i.test(msg)) {
      return NextResponse.json(
        { error: "A memory for this attribute already exists. Edit it instead." },
        { status: 409 }
      );
    }
    if (/was deleted/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "This attribute was deleted. Re-create it explicitly to restore it.",
          needsReactivate: true,
        },
        { status: 409 }
      );
    }
    console.error("[api/memories POST] error:", msg);
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

// PATCH /api/memories?userId=...  body: { entity?, attribute, value, confidence? }
// Updates the active memory for (entity, attribute): supersedes the old version
// and makes the new value the active one. Latest version always wins; the old
// version cannot override it (enforced by the store's single-active invariant).
export async function PATCH(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entity = typeof body?.entity === "string" ? body.entity.trim() : "user";
  const attribute = typeof body?.attribute === "string" ? body.attribute.trim() : "";
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const confidence =
    typeof body?.confidence === "number" ? body.confidence : undefined;

  if (!attribute) {
    return NextResponse.json({ error: "attribute is required" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  if (value.length > MAX_VALUE) {
    return NextResponse.json(
      { error: `value must be <= ${MAX_VALUE} chars` },
      { status: 400 }
    );
  }

  try {
    // Ownership check: only act if the key exists for THIS user (or allow create
    // when it does not yet exist, matching updateMemory's create-fallback).
    const rec = updateMemory({
      userId,
      entity,
      attribute,
      value,
      source: "profile-ui",
      confidence,
    });
    return NextResponse.json({ memory: toPublic(rec) }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update memory";
    if (/was deleted/i.test(msg)) {
      return NextResponse.json(
        { error: "This attribute was deleted; re-create it to restore.", needsReactivate: true },
        { status: 409 }
      );
    }
    console.error("[api/memories PATCH] error:", msg);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

// DELETE /api/memories?userId=...&entity=user&attribute=preferred_editor
// Soft-deletes (tombstone) the memory so it is excluded from all normal
// model-facing retrieval immediately. The underlying value is retained in audit
// history (soft delete, NOT permanent erasure) — the UI communicates this.
export async function DELETE(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const entity = (searchParams.get("entity") || "user").trim();
  const attribute = (searchParams.get("attribute") || "").trim();
  if (!attribute) {
    return NextResponse.json({ error: "attribute is required" }, { status: 400 });
  }

  try {
    // Ownership: removeMemory is scoped to userId; if no active record exists
    // for this user it is a no-op that returns any existing tombstone.
    const existing = getActiveRecord(userId, entity, attribute);
    if (!existing) {
      return NextResponse.json(
        { error: "No active memory found for that attribute" },
        { status: 404 }
      );
    }
    removeMemory(userId, entity, attribute, "profile-ui-deletion");
    return NextResponse.json(
      {
        deleted: true,
        softDelete: true,
        note: "Removed from model context. Value retained in audit history (soft delete, not permanent erasure).",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(
      "[api/memories DELETE] error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
