import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_PATHS = new Set([
  "/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/gradient-logomark.svg",
  "/preview_image.png",
]);

const ALLOWED_PREFIXES = ["/api", "/_next", "/static", "/assets", "/images"];
const PUBLIC_FILE_PATTERN =
  /\.(?:avif|css|gif|ico|jpg|jpeg|js|json|m4a|mp3|mp4|ogg|png|svg|txt|wav|webm|webp|xml)$/i;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const WAITLIST_STAGE = process.env.NEXT_PUBLIC_WAITLIST_STAGE === "true";

  if (!WAITLIST_STAGE) {
    return NextResponse.next();
  }

  if (ALLOWED_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_FILE_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  if (ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/:path*"],
};
