/** Message the owner signs with FUCI_SELLER_ADDRESS to use /setup (shared by client and server). */
export const setupMessage = (address: string, issuedAt: number) =>
  ["Fuci setup: sign in as the site owner", `Address: ${address}`, `Issued at: ${issuedAt}`].join("\n");
