import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `http://4.224.186.213/evaluation-service/${pathStr}${searchParams ? `?${searchParams}` : ""}`;

  let authHeader = request.headers.get("Authorization");
  if (!authHeader && process.env.NEXT_PUBLIC_API_TOKEN) {
    authHeader = `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`;
  }

  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      return new NextResponse(await res.text(), { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const url = `http://4.224.186.213/evaluation-service/${pathStr}`;

  let authHeader = request.headers.get("Authorization");
  if (!authHeader && process.env.NEXT_PUBLIC_API_TOKEN) {
    authHeader = `Bearer ${process.env.NEXT_PUBLIC_API_TOKEN}`;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return new NextResponse(await res.text(), { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
