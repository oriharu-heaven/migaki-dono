/** Vercel Serverless Function (Edge) のエントリ。実装は _core.ts の1本だけ。 */
import { handleGenerate, type Env } from "./_core";

export const config = { runtime: "edge" };

export default function handler(req: Request): Promise<Response> {
  return handleGenerate(req, process.env as Env);
}
