import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "active",
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  return NextResponse.json(campaigns);
}
