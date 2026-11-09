import { redirect } from "next/navigation";

/**
 * The old Support tab. Password resets and the reports queue moved to People
 * (/admin/people); this keeps old bookmarks and emailed links working.
 */
export default function AdminSupportRedirect() {
  redirect("/admin/people");
}
