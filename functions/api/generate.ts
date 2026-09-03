/** Cloudflare Pages Functions のエントリ。実装は api/_core.ts と共有する。 */
import { handleGenerate, type Env } from "../../api/_core";

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequest(ctx: PagesContext): Promise<Response> {
  return handleGenerate(ctx.request, ctx.env);
}
