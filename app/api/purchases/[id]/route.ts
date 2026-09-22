import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { units, amount_tzs, note, vendor, created_at } = body;

  await db.execute({
    sql: "UPDATE purchases SET units = ?, amount_tzs = ?, note = ?, vendor = ?, created_at = ? WHERE id = ?",
    args: [units, amount_tzs, note ?? "", vendor ?? "", created_at, parseInt(id)],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM purchases WHERE id = ?",
    args: [parseInt(id)],
  });
  return NextResponse.json({ ok: true });
}
