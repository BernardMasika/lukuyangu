import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { detectChanges } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await db.execute({
    sql: "SELECT * FROM readings ORDER BY created_at ASC",
    args: [],
  });

  const readings = result.rows as unknown as {
    reading: number;
    created_at: string;
  }[];

  const changes = detectChanges(readings);

  return NextResponse.json({ changes });
}
