import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gacha | Verity",
  description: "Play Gacha, Catch Cards, and Earn Rewards",
};

export default function GachaLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}