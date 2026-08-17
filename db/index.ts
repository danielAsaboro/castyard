import { env } from "cloudflare:workers";

import { CatalogueRepository, type D1DatabaseLike } from "@/features/catalogue/repository";
import { ReferenceSellerRepository } from "@/features/reference-seller/repository";
import { catalogueSchemaStatements } from "./schema";

export function getCatalogueRepository(): CatalogueRepository {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return new CatalogueRepository(env.DB as unknown as D1DatabaseLike);
}

export function getReferenceSellerRepository(): ReferenceSellerRepository {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return new ReferenceSellerRepository(env.DB as unknown as D1DatabaseLike);
}

export async function ensureCatalogueSchema(): Promise<void> {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  const db = env.DB as unknown as D1DatabaseLike;
  await db.batch(catalogueSchemaStatements.map((sql) => db.prepare(sql)));
}
