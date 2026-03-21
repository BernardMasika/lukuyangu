import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const readings = await db.execute({
    sql: "SELECT * FROM readings ORDER BY created_at ASC",
    args: [],
  });
  const purchases = await db.execute({
    sql: "SELECT * FROM purchases ORDER BY created_at ASC",
    args: [],
  });

  let csv = "type,id,reading,units,amount_tzs,note,created_at\n";

  for (const row of readings.rows) {
    const r = row as unknown as {
      id: number;
      reading: number;
      note: string;
      created_at: string;
    };
    csv += `reading,${r.id},${r.reading},,,${csvEscape(r.note)},${r.created_at}\n`;
  }

  for (const row of purchases.rows) {
    const p = row as unknown as {
      id: number;
      units: number;
      amount_tzs: number;
      note: string;
      created_at: string;
    };
    csv += `purchase,${p.id},,${p.units},${p.amount_tzs},${csvEscape(p.note)},${p.created_at}\n`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="luku-data-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(val: string): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
