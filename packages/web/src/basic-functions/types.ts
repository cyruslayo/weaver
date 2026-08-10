export interface BasicOpenUrlRequest {
  url: string;
}

export type BasicOpenUrlPolicy = (request: Readonly<BasicOpenUrlRequest>) => string | undefined;

export interface BasicCatalogBrowserFunctionOptions {
  catalogId: string;
  baseUrl?: string;
  openUrlPolicy?: BasicOpenUrlPolicy;
}
