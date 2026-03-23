import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit");

  let sql = "SELECT * FROM outages";
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (from) {
    conditions.push("start_at >= ?");
    args.push(from);
  }
  if (to) {
    conditions.push("start_at <= ?");
    args.push(to);
  }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY start_at DESC";
  if (limit) {
    sql += " LIMIT ?";
    args.push(parseInt(limit));
  }

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { start_at, end_at, note } = body;

  if (!start_at) {
    return NextResponse.json(
      { error: "start_at is required" },
      { status: 400 }
    );
  }

  const result = await db.execute({
    sql: "INSERT INTO outages (start_at, end_at, note, created_at) VALUES (?, ?, ?, ?)",
    args: [start_at, end_at || null, note || "", new Date().toISOString()],
  });

  return NextResponse.json(
    {
      id: Number(result.lastInsertRowid),
      start_at,
      end_at: end_at || null,
      note: note || "",
    },
    { status: 201 }
  );
}
