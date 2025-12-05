import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin"
};

export default function AdminHomePage() {
  redirect("/admin/games");
}
