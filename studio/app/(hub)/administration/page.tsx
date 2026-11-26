import { redirect } from "next/navigation";

// Administration is part of Settings & Administration now.
export default function Administration() {
  redirect("/settings");
}
