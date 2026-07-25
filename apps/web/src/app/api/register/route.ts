// Registrasi akun: username + email + password (tanpa GitHub).
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@minipaas/db";

export async function POST(req: Request) {
  const { name, username, email, password } = await req.json().catch(() => ({}));

  if (!username?.trim() || !email?.trim() || !password) {
    return NextResponse.json(
      { error: "Username, email, dan password wajib diisi." },
      { status: 400 },
    );
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: "Username 3–32 karakter, hanya huruf/angka/._-" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password minimal 8 karakter." }, { status: 400 });
  }

  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username }] },
  });
  if (taken) {
    return NextResponse.json(
      { error: "Username atau email sudah terdaftar." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name: (name?.trim() || username).slice(0, 60),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: "USER",
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
