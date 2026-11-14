import { redirect } from "next/navigation";

// The app's front door is your private sign-in page.
export default function Home() {
  redirect("/admin");
}
