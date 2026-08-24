import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";

export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}
