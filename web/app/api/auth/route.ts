import backendRequest, { BackendError } from "@/lib/server/backendRequest";
import { getAuthToken } from "@/lib/server/getAuthToken";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);
    const response = await backendRequest(tokenData, "/users/me", "GET");

    return NextResponse.json(response, {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tokenData = getAuthToken(request);

    await request.json().catch(() => ({}));

    const response = await backendRequest(
      tokenData,
      "/users/me",
      "GET"
    );

    return NextResponse.json(response, {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    // console.error(error);
    if (error instanceof BackendError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}
