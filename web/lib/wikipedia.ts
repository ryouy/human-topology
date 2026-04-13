export type WikiSummary = {
  title: string;
  extract: string;
  thumbnail?: string | null;
  content_urls?: { desktop?: { page?: string } };
};

const UA = "perDistMap/0.1 (educational graph; local)";

export async function fetchJaWikiSummary(title: string): Promise<WikiSummary | { error: string }> {
  const enc = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${enc}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  return res.json() as Promise<WikiSummary>;
}
