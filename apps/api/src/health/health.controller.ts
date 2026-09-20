import { Controller, Get } from "@nestjs/common";

import { PublicRoute } from "../common/public.decorator.js";

@Controller()
export class HealthController {
  @PublicRoute()
  @Get("healthz")
  health() {
    return { status: "ok", service: "routeloom-api" };
  }

  @PublicRoute()
  @Get("readyz")
  ready() {
    return { status: "ready", service: "routeloom-api" };
  }
}
