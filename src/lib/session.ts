import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";

// Use at the top of every protected page / server action.
export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) redirect("/login");
  return user;
}

export { agentFirstName } from "./agent";
