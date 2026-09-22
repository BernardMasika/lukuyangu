import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildSegments,
  burnRateFrom,
  dailySeries,
  purchaseLifetimes,
  type ReadingRow,
  type PurchaseRow,
  type OutageRow,
} from "@/lib/ledger";
import { getTimePeriod } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Reads the ledger and asks Claude what it means.
 *
 * The arithmetic elsewhere in this app can only answer questions it was written
 * to answer. This route exists for the ones nobody wrote code for: why a week
 * went strange, whether a habit is forming, how confident any of it is.
 *
 * Two rules it must not break, both from how this app is meant to work:
 * only the household's own numbers go in, and nothing about appliances or
 * lifestyle is assumed. Claude is told the same.
 *
 * GET  returns the cached analysis and never spends money.
 * POST regenerates, but only when the data actually changed (or force: true).
 */

const CACHE_KEY = "insight_cache";
const MIN_READINGS = 4;

const InsightSchema = z.object({
  headline: z
    .string()
    .describe("One sentence, the single most useful thing in this data"),
  insights: z
    .array(
      z.object({
        title: z.string().describe("A short label, at most six words"),
        detail: z
          .string()
          .describe(
            "Two or three sentences. Cite the household's own numbers. Say how confident you are and why."
          ),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("Two to four insights, most useful first"),
  watchOut: z
    .string()
    .describe(
      "One thing that could go wrong or is worth watching, from this data only"
    ),
});

type Insight = z.infer<typeof InsightSchema>;

interface CachedInsight {
  generatedAt: string;
  fingerprint: string;
  lang: string;
  data: Insight;
}

async function readCache(): Promise<CachedInsight | null> {
  const result = await db.execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [CACHE_KEY],
  });
  if (result.rows.length === 0) return null;
  try {
    return JSON.parse((result.rows[0] as unknown as { value: string }).value);
  } catch {
    return null;
  }
}

/** Everything the model needs, and nothing that identifies anybody. */
async function buildBriefing() {
  const [readingsResult, purchasesResult, outagesResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM readings ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT * FROM purchases ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT start_at, end_at FROM outages", args: [] }),
  ]);

  const readings = readingsResult.rows as unknown as ReadingRow[];
  const purchases = purchasesResult.rows as unknown as PurchaseRow[];
  const outages = outagesResult.rows as unknown as OutageRow[];

  const segments = buildSegments(readings, purchases, outages);
  const burn = burnRateFrom(segments);
  const lifetimes = purchaseLifetimes(
    segments,
    purchases,
    readings.length > 0 ? readings[0].reading : 0
  );

  // Which parts of the day the units actually go, by Swahili period.
  const byPeriod: Record<string, { units: number; hours: number }> = {};
  for (const seg of segments) {
    const period = getTimePeriod(seg.from);
    byPeriod[period] ??= { units: 0, hours: 0 };
    byPeriod[period].units += seg.consumption;
    byPeriod[period].hours += seg.activeHours;
  }
  const periodRates = Object.fromEntries(
    Object.entries(byPeriod).map(([k, v]) => [
      k,
      v.hours > 0 ? Math.round((v.units / (v.hours / 24)) * 10) / 10 : null,
    ])
  );

  return {
    readings: readings.length,
    firstReadingAt: readings[0]?.created_at ?? null,
    currentBalance: readings[readings.length - 1]?.reading ?? null,
    burnRatePerActiveDay: burn ? Math.round(burn.rate * 100) / 100 : null,
    dailyConsumption: dailySeries(segments, 30),
    ratePerSwahiliPeriod: periodRates,
    purchases: lifetimes.map((l) => ({
      units: l.units,
      tzs: l.amount_tzs,
      tzsPerUnit: l.tzsPerUnit,
      vendor: l.vendor || "not recorded",
      daysLasted: l.running ? null : l.days,
      stillRunning: l.running,
    })),
    outages: outages
      .filter((o) => o.end_at)
      .map((o) => ({
        start: o.start_at,
        hours:
          Math.round(
            ((new Date(o.end_at!).getTime() - new Date(o.start_at).getTime()) /
              3_600_000) *
              10
          ) / 10,
      })),
    suspectSegments: segments.filter((s) => s.suspect).length,
    fingerprint: `${readings.length}:${purchases.length}:${outages.length}:${
      readings[readings.length - 1]?.created_at ?? ""
    }`,
  };
}

const SYSTEM_PROMPT = `You analyse prepaid electricity (LUKU) data for one household in Dar es Salaam, Tanzania.

The meter counts DOWN: a reading is units remaining, not units used. Consumption has already been worked out for you and is given in kWh per day. Outage hours are already excluded from the rates.

Hard rules:
- Use ONLY the numbers in the briefing. Never assume which appliances the household owns, how many people live there, their income, or their habits. If you want to suggest a cause, phrase it as a question for them to answer, not a fact.
- Say what you are unsure about. A pattern from four days of data is not a pattern; say so and mark it low confidence.
- Quote their actual figures when you make a point.
- Tanzanian context is fair game: TANESCO cuts are common and often unannounced, agents sell units at a worse rate than M-Pesa or bank apps, and the hot season raises cooling load.
- Be useful, not encouraging. If nothing interesting is in the data, say that plainly and keep it to one insight.
- Write in plain sentences. Use commas, not dashes, inside sentences.`;

export async function GET() {
  const cached = await readCache();
  return NextResponse.json({
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    cached,
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const lang: string = body.lang === "sw" ? "sw" : "en";
  const force: boolean = body.force === true;

  const briefing = await buildBriefing();

  if (briefing.readings < MIN_READINGS) {
    return NextResponse.json(
      { configured: true, needMoreData: true },
      { status: 200 }
    );
  }

  // Nothing new since last time, so do not spend a call on it.
  const cached = await readCache();
  if (
    !force &&
    cached &&
    cached.fingerprint === briefing.fingerprint &&
    cached.lang === lang
  ) {
    return NextResponse.json({ configured: true, cached });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2048,
      // A short read over a small table, so depth is not where the value is.
      output_config: {
        effort: "low",
        format: zodOutputFormat(InsightSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write the analysis in ${
            lang === "sw" ? "Swahili" : "English"
          }.\n\nBriefing:\n${JSON.stringify(briefing, null, 2)}`,
        },
      ],
    });

    if (!response.parsed_output) {
      return NextResponse.json(
        { configured: true, error: "unparsed" },
        { status: 502 }
      );
    }

    const payload: CachedInsight = {
      generatedAt: new Date().toISOString(),
      fingerprint: briefing.fingerprint,
      lang,
      data: response.parsed_output,
    };

    await db.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [CACHE_KEY, JSON.stringify(payload)],
    });

    return NextResponse.json({ configured: true, cached: payload });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { configured: true, error: "rate_limited" },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { configured: false, error: "bad_key" },
        { status: 200 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { configured: true, error: `api_${e.status}` },
        { status: 502 }
      );
    }
    throw e;
  }
}
