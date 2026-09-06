export type MetadataLookupErrorCode = 'network' | 'auth' | 'rateLimit' | 'provider';

export class MetadataLookupError extends Error {
  constructor(
    readonly provider: string,
    readonly code: MetadataLookupErrorCode
  ) {
    super(`${provider} metadata lookup failed: ${code}`);
    this.name = 'MetadataLookupError';
  }
}
