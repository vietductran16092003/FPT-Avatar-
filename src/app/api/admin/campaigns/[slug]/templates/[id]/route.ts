import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const result = await prisma.template.updateMany({
    where: { id: params.id, campaign: { slug: params.slug } },
    data: body,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: `Template "${params.id}" not found in campaign "${params.slug}"` }, { status: 404 });
  }
  const template = await prisma.template.findUnique({ where: { id: params.id } });
  return NextResponse.json(template);
}

export async function DELETE(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const template = await prisma.template.findFirst({
    where: { id: params.id, campaign: { slug: params.slug } },
  });
  if (!template) {
    return NextResponse.json({ error: `Template "${params.id}" not found in campaign "${params.slug}"` }, { status: 404 });
  }

  try {
    const deleted = await prisma.template.delete({ where: { id: params.id } });
    return NextResponse.json(deleted);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: `Template "${params.id}" still has generated avatars and cannot be deleted` },
        { status: 409 },
      );
    }
    throw err;
  }
}
