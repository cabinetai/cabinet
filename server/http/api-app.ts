import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { apiAuthGate } from "./auth-gate";
import { mountRouteModule, type RouteModule } from "./next-route-adapter";
import { apiRoutes } from "./route-manifest";

/**
 * The Express app hosting the /api surface (the Next.js route handlers from
 * src/app/api, mounted verbatim through the adapter).
 *
 * Deliberately NO body-parsing middleware: handlers consume the raw web
 * stream (req.json()/req.formData()); express.json() would drain it first.
 */
export function buildApiApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(apiAuthGate);
  for (const route of apiRoutes) {
    mountRouteModule(app, route.path, route.module as RouteModule);
  }
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  });
  return app;
}
