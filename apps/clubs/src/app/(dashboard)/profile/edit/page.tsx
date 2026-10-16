import { permanentRedirect } from "next/navigation";

/** The profile is edited in place on /profile; this old address only forwards there. */
export default function EditProfilePage() {
  permanentRedirect("/profile");
}
