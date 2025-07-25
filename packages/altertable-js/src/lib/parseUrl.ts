type ParsedUrl = {
  baseUrl: string;
  searchParams: Record<string, string>;
};

export function parseUrl(url: string): ParsedUrl | null {
  try {
    const parsedUrl = new URL(url);
    return {
      baseUrl: `${parsedUrl.origin}${parsedUrl.pathname}`,
      searchParams: Object.fromEntries(parsedUrl.searchParams),
    };
  } catch {
    return null;
  }
}
