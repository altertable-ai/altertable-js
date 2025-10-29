export type ApiErrorCode = 'environment-not-found';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public errorCode?: ApiErrorCode,
    public details?: any
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}
