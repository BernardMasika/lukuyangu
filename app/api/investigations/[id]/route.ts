import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Forget a pin's notes. If the stretch is still a spike it comes back as new. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: "id must be a positive integer" }, { status: 400 });
  }
  await db.execute({ sql: "DELETE FROM investigations WHERE id = ?", args: [n] });
  return NextResponse.json({ ok: true });
}
