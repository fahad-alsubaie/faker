import { ConvexHttpClient } from "convex/browser";

const url = import.meta.env.PUBLIC_CONVEX_URL;

export const convexHttp = new ConvexHttpClient(url || "", {
  skipConvexDeploymentUrlCheck: true,
});
