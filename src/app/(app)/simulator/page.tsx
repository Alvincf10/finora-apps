import { redirect } from "next/navigation";

/** Decision Lab UI removed — keep route so old bookmarks land somewhere useful. */
export default function SimulatorRemovedPage() {
  redirect("/insights");
}
