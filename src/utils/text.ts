/**
 * Converts provider-supplied HTML to plain text for display. The result is rendered as text by
 * React, never as HTML.
 */
export function htmlToText(value: string | null | undefined): string {
  if (!value) return '';
  if (typeof DOMParser === 'undefined') {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}
