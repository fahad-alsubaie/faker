import { ConvexReactClient } from "convex/react";

const url = import.meta.env.PUBLIC_CONVEX_URL;

if (!url) {
  throw new Error("PUBLIC_CONVEX_URL is not set");
}

export const convex = new ConvexReactClient(url, {
  unsavedChangesWarning: false,
  skipConvexDeploymentUrlCheck: true,
});
