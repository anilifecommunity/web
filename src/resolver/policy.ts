import { getProvider, isAttemptable } from './registry';
import type { ProviderDefinition, SelectionPolicy } from './types';
import type { ResolverReason as Reason } from './errors';

export function statusReason(status: ProviderDefinition['webStatus']): Reason {
  switch (status) {
    case 'permission-pending':
      return 'permission_required';
    case 'native-only':
    case 'unavailable':
      return 'not_available_on_web';
    case 'unverified':
    case 'browser-direct':
    case 'worker-metadata-only':
    case 'iframe':
    default:
      return 'provider_unavailable';
  }
}

export interface Preflight {
  ok: boolean;
  reason?: Reason;
  order: string[];
}

/**
 * Decides which providers may be attempted, in which order.
 *
 * Rules that must not drift:
 * - the viewer's explicit selection is always first;
 * - when fallback is disabled, nothing else is attempted;
 * - providers that cannot work in a browser are never attempted, and never silently replaced;
 * - declared-language providers only join an automatic walk when their language was requested.
 */
export function planAttempts(policy: SelectionPolicy): Preflight {
  const selectedId = policy.selectedProvider?.trim() || null;
  const selected = selectedId ? getProvider(selectedId) : undefined;

  const configuredOrder =
    policy.preferredOrder && policy.preferredOrder.length > 0
      ? policy.preferredOrder
      : [];
  const enabled = policy.enabled ? new Set(policy.enabled) : null;

  const eligible = (id: string): boolean => {
    const provider = getProvider(id);
    if (!provider) return false;
    if (!isAttemptable(provider)) return false;
    if (enabled && !enabled.has(id)) return false;
    if (policy.hideAdult && provider.capabilities.adultOnly) return false;
    // A provider that declares no language is treated as English, mirroring Android: an
    // English request never reaches the Spanish/Hindi/Arabic servers, and a Spanish request
    // never reaches an undeclared English one.
    const providerLanguage = provider.declaredLanguage ?? 'English';
    if (
      policy.preferredLanguage &&
      providerLanguage.toLowerCase() !== policy.preferredLanguage.toLowerCase()
    ) {
      return false;
    }
    return true;
  };

  if (selectedId && !selected) {
    return { ok: false, reason: 'unknown_provider', order: [] };
  }

  if (selected && !isAttemptable(selected)) {
    return { ok: false, reason: statusReason(selected.webStatus), order: [] };
  }

  if (selected && enabled && !enabled.has(selected.id)) {
    return { ok: false, reason: 'disabled', order: [] };
  }

  if (selected) {
    if (!policy.allowFallback) {
      return eligible(selected.id)
        ? { ok: true, order: [selected.id] }
        : { ok: false, reason: statusReason(selected.webStatus), order: [] };
    }
    const rest = configuredOrder.filter((id) => id !== selected.id && eligible(id));
    return { ok: true, order: [selected.id, ...dedupe(rest)] };
  }

  return { ok: true, order: dedupe(configuredOrder.filter(eligible)) };
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
