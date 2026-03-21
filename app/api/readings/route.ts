import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit");

  let sql = "SELECT * FROM readings";
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (from) {
    conditions.push("created_at >= ?");
    args.push(from);
  }
  if (to) {
    conditions.push("created_at <= ?");
    args.push(to);
  }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC";
  if (limit) {
    sql += " LIMIT ?";
    args.push(parseInt(limit));
  }

  const result = await db.execute({ sql, args });
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reading, note } = body;

  if (reading === undefined || reading === null) {
    return NextResponse.json(
      { error: "reading is required" },
      { status: 400 }
    );
  }

  const result = await db.execute({
    sql: "INSERT INTO readings (reading, note, created_at) VALUES (?, ?, ?)",
    args: [reading, note || "", body.created_at || new Date().toISOString()],
  });

  return NextResponse.json(
    { id: Number(result.lastInsertRowid), reading, note: note || "" },
    { status: 201 }
  );
}
