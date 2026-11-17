import { z } from "zod";

/** Request fields for Admin → Products & Bundles (shared by the create and edit routes). */
export const productFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  url: z.string().trim().url().nullable().optional(),
  priceInr: z.number().int().min(0).max(10_000_000).nullable().optional(),
  priceCad: z.number().int().min(0).max(1_000_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
};

export const bundleFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  productIds: z.array(z.string().min(1)).min(1).max(30),
  priceInr: z.number().int().min(0).max(10_000_000).nullable().optional(),
  priceCad: z.number().int().min(0).max(1_000_000).nullable().optional(),
  interval: z.enum(["MONTHLY", "YEARLY"]).optional(),
  growthManager: z.boolean().optional(),
  smsMonthlyLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
};
