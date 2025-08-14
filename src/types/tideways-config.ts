export interface TidewaysConfig {
  token: string;
  organization: string;
  project: string;
  baseUrl?: string;
  maxRetries?: number;
  requestTimeout?: number;
}
