import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { reading, note, created_at } = body;

  await db.execute({
    sql: "UPDATE readings SET reading = ?, note = ?, created_at = ? WHERE id = ?",
    args: [reading, note ?? "", created_at, parseInt(id)],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM readings WHERE id = ?",
    args: [parseInt(id)],
  });
  return NextResponse.json({ ok: true });
}
