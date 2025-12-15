import { redirect } from "next/navigation";

export default function HomePage() {
  // Stage 1: main experience is /chat (v1.0).
  // Homepage content will be implemented per spec later.
  redirect("/chat");
}
