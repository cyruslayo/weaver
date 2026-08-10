export interface BasicRegexMatchRequest {
  value: string;
  pattern: string;
}

export type BasicRegexMatcher = (request: Readonly<BasicRegexMatchRequest>) => boolean;

export interface BasicCatalogFunctionOptions {
  catalogId: string;
  locale?: string | readonly string[];
  timeZone?: string;
  regexMatcher?: BasicRegexMatcher;
}
