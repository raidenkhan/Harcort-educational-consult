import { permanentRedirect } from "next/navigation";

/**
 * /library is retired.
 *
 * The study library and the course catalogue were two doors into the same
 * thing: the catalogue knew each course's code, credits and tutors; the
 * library knew each course's Drive folder and video playlists. They are now
 * one page — pick programme → level → semester → course on /courses, and the
 * course page shows its notes folder, tutorial videos and available tutors
 * together.
 *
 * Kept as a permanent redirect so bookmarks, shared links and anything Google
 * has already indexed still land somewhere useful.
 */
export default function LibraryPage() {
  permanentRedirect("/courses");
}
