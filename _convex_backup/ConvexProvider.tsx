import { ConvexProvider as CP } from "convex/react";
import { ReactNode } from "react";
import { convex } from "../lib/convex";

export default function ConvexProvider({ children }: { children: ReactNode }) {
  return <CP client={convex}>{children}</CP>;
}
