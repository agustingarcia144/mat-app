"use node";

import { internalAction } from "./_generated/server";

// Internal-only: lets operators verify the provider's actual runtime patch.
export const versions = internalAction({
  args: {},
  handler: async () => ({
    node: process.versions.node,
    brotli: process.versions.brotli,
    openssl: process.versions.openssl,
    undici: process.versions.undici,
  }),
});
