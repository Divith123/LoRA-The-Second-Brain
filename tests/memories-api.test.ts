// tests/memories-api.test.ts
// Part 4 tests: exercise the /api/memories route handlers directly (no HTTP
// server) to verify validation, ownership scoping, and CRUD semantics.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { tmpDbPath, cleanupDbPath } from "./fixtures";

const BASE = "http://localhost/api/memories";

// Each test uses an isolated DB file via the env the route's getDb() reads.
function url(params: Record<string, string>) {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function importRoute() {
  // Fresh import each time so the module picks up the current env DB path.
  return await import("@/app/api/memories/route");
}

describe("Part 4 — /api/memories route handlers", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath("api");
    process.env.SECOND_BRAIN_DB_PATH = dbPath;
  });
  afterEach(() => {
    cleanupDbPath(dbPath);
    delete process.env.SECOND_BRAIN_DB_PATH;
  });

  it("GET requires userId (400)", async () => {
    const { GET } = await importRoute();
    const res = await GET(new NextRequest(BASE));
    expect(res.status).toBe(400);
  });

  it("POST validates missing attribute and value (400)", async () => {
    const { POST } = await importRoute();
    const u = url({ userId: "u1" });
    const noAttr = await POST(
      new NextRequest(u, { method: "POST", body: JSON.stringify({ value: "x" }) })
    );
    expect(noAttr.status).toBe(400);
    const noVal = await POST(
      new NextRequest(u, { method: "POST", body: JSON.stringify({ attribute: "a" }) })
    );
    expect(noVal.status).toBe(400);
  });

  it("POST creates, GET lists, PATCH updates, DELETE removes (full lifecycle)", async () => {
    const { GET, POST, PATCH, DELETE } = await importRoute();
    const u = url({ userId: "u1" });

    // Create
    const created = await POST(
      new NextRequest(u, {
        method: "POST",
        body: JSON.stringify({ attribute: "preferred_editor", value: "VS Code" }),
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.memory.value).toBe("VS Code");
    expect(createdBody.memory.version).toBe(1);

    // Update -> Cursor
    const patched = await PATCH(
      new NextRequest(u, {
        method: "PATCH",
        body: JSON.stringify({ attribute: "preferred_editor", value: "Cursor" }),
      })
    );
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.memory.value).toBe("Cursor");
    expect(patchedBody.memory.version).toBe(2);

    // List -> only active Cursor
    const listed = await GET(new NextRequest(u));
    const listBody = await listed.json();
    expect(listBody.memories.length).toBe(1);
    expect(listBody.memories[0].value).toBe("Cursor");

    // History -> both versions
    const hist = await GET(
      new NextRequest(url({ userId: "u1", history: "1", entity: "user", attribute: "preferred_editor" }))
    );
    const histBody = await hist.json();
    expect(histBody.history.length).toBe(2);

    // Delete -> soft delete
    const del = await DELETE(
      new NextRequest(url({ userId: "u1", entity: "user", attribute: "preferred_editor" }), { method: "DELETE" })
    );
    expect(del.status).toBe(200);
    const delBody = await del.json();
    expect(delBody.softDelete).toBe(true);

    // List after delete -> empty
    const after = await GET(new NextRequest(u));
    const afterBody = await after.json();
    expect(afterBody.memories.length).toBe(0);
  });

  it("POST on an existing active attribute returns 409", async () => {
    const { POST } = await importRoute();
    const u = url({ userId: "u1" });
    await POST(new NextRequest(u, { method: "POST", body: JSON.stringify({ attribute: "city", value: "A" }) }));
    const dup = await POST(
      new NextRequest(u, { method: "POST", body: JSON.stringify({ attribute: "city", value: "B" }) })
    );
    expect(dup.status).toBe(409);
  });

  it("DELETE on a non-existent attribute returns 404", async () => {
    const { DELETE } = await importRoute();
    const res = await DELETE(
      new NextRequest(url({ userId: "u1", entity: "user", attribute: "nope" }), { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  it("enforces per-user ownership (user B cannot see user A's memory)", async () => {
    const { GET, POST } = await importRoute();
    await POST(
      new NextRequest(url({ userId: "userA" }), {
        method: "POST",
        body: JSON.stringify({ attribute: "secret", value: "classified" }),
      })
    );
    const bList = await GET(new NextRequest(url({ userId: "userB" })));
    const bBody = await bList.json();
    expect(bBody.memories.length).toBe(0);
  });
});
