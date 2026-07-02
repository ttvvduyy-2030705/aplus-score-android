export const useAplusPro = () => ({
  isAplusProActive: true,
  billingError: '',
  showPaywall: () => undefined,
  hidePaywall: () => undefined,
  requireAplusPro: <T,>(_reason: any, callback: () => T): T => callback(),
  purchasePlan: async () => undefined,
  restorePurchases: async () => undefined,
  transferAplusProToThisDevice: async () => undefined,
});

export const SubscriptionProvider = ({children}: {children: any}) => children;
