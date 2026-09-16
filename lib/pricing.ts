// Draft pricing config — see PRICING.md for the reasoning and open
// questions. These numbers are a starting proposal, not finalized; update
// here once locked in and the landing page picks it up automatically.
export type PricingTier = {
  name: string;
  priceInrPerMonth: number;
  customerLimit: string;
  features: string[];
};

export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Starter",
    priceInrPerMonth: 999,
    customerLimit: "Up to 300 customers",
    features: [
      "WhatsApp passive data capture",
      "Behavioral segmentation",
      "Static Hinglish calling scripts",
    ],
  },
  {
    name: "Growth",
    priceInrPerMonth: 2499,
    customerLimit: "Up to 1,500 customers",
    features: [
      "Everything in Starter",
      "AI-personalized calling scripts",
      "Pay-per-call voice calling passthrough",
    ],
  },
  {
    name: "Pro",
    priceInrPerMonth: 5999,
    customerLimit: "Unlimited customers",
    features: [
      "Everything in Growth",
      "Custom scripts per business",
      "Multiple locations, priority support",
    ],
  },
];
