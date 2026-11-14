import { redirect } from "next/navigation";
import { brand } from "@/lib/brand.ts";

// Nothing public lives at the root: send visitors to the main website.
export default function Home() {
  redirect(brand.website);
}
