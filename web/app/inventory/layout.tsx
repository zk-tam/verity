import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory | Verity",
  description: "View your Catches.",
};

export default function GachaLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}