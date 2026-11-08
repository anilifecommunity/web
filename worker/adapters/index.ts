import type { ProviderAdapter } from '../../src/resolver';
import { resolveAnichan } from './anichan';

/**
 * Adapters implemented in this Worker. Keyed by provider id; a provider absent here is not
 * attemptable no matter what a caller asks for.
 */
export const ADAPTERS: Record<string, ProviderAdapter> = {
  anichan: resolveAnichan,
};
