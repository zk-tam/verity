import backendRequest from "@/lib/server/backendRequest";
import { getAuthToken } from "@/lib/server/getAuthToken";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function POST(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);
    if (!tokenData) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { code } = body as { code?: string };

    const response = await backendRequest(
      tokenData,
      "/referrals/apply",
      "POST",
      undefined,
      { code },
    );

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Referrals apply API error:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        {
          status: (error as { status?: number }).status || 500,
          headers: noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
