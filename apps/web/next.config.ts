import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  transpilePackages: ['@repopilot/api-client'],
};
export default config;
