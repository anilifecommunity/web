// stub; npm run ext:build overwrites this file
import type { HostImports } from '../replay';

export interface BuiltExtension {
  name: string;
  hosts: string[];
  instantiate(host: HostImports): Promise<{ servers(query: unknown): unknown }>;
}

export const EXTENSIONS: Record<string, BuiltExtension> = {};
