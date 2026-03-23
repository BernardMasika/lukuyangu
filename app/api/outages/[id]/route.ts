import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { start_at, end_at, note } = body;

  await db.execute({
    sql: "UPDATE outages SET start_at = ?, end_at = ?, note = ? WHERE id = ?",
    args: [start_at, end_at ?? null, note ?? "", parseInt(id)],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM outages WHERE id = ?",
    args: [parseInt(id)],
  });
  return NextResponse.json({ ok: true });
}
