// The bundle's customer-facing name. NEXT_PUBLIC_BUNDLE_NAME overrides it
// (e.g. for a white-label client); the default is Loopdesk AI.
export const BUNDLE_NAME = process.env.NEXT_PUBLIC_BUNDLE_NAME || "Loopdesk AI";

// Customer-facing names of the tools inside the bundle. Change them here only.
export const TOOL_NAMES = {
  calls: `${BUNDLE_NAME} Calls`,
  jobs: `${BUNDLE_NAME} Jobs`,
  google: `${BUNDLE_NAME} Google Profile`,
  ads: `${BUNDLE_NAME} Ads`,
  growth: `${BUNDLE_NAME} Growth Manager`,
} as const;
