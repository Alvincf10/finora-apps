import { fail, ok } from "@/lib/api";

/** Personal single-user app — registration is permanently disabled. */
export async function GET() {
  return ok({ open: false, bootstrap: false });
}

export async function POST() {
  return fail("REGISTER_DISABLED", "Registration is closed", 403);
}
