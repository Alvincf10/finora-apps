import { redirect } from "next/navigation";

/** Personal single-user app — no public registration. */
export default function RegisterPage() {
  redirect("/login");
}
