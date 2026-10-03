import type { NextRequest } from "next/server";
import { answerAddress } from "@/lib/address/handler";
import { addressSource } from "@/lib/address/source";

// The address lists for the candidate form: GET /api/address/provinces, and
// /api/address/districts?provinceId=12, /communes?districtId=1201, /villages?communeId=120101.
// Signing in is enforced by proxy.ts, like every page. The lists are public geodata, so the browser may keep a copy
// for an hour; a failure is never kept.

export async function GET(request: NextRequest, { params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  const reply = await answerAddress(level, request.nextUrl.searchParams, addressSource);

  return Response.json(reply.body, {
    status: reply.status,
    headers: { "Cache-Control": reply.status === 200 ? "private, max-age=3600" : "no-store" },
  });
}
