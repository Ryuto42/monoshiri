import { accessToken } from './ai.ts';
import { LOCAL, PROJECT } from './config.ts';
import { addSpent } from './store.ts';

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';
type Annotation = { adult?: Likelihood; violence?: Likelihood; racy?: Likelihood; medical?: Likelihood; spoof?: Likelihood };

// Cloud Vision bills SafeSearch per image (the first 1,000 a month are free); counted against the same meters as the AI calls.
const USD_PER_IMAGE = 0.0015;
const RANK: Record<Likelihood, number> = { UNKNOWN: 0, VERY_UNLIKELY: 0, UNLIKELY: 1, POSSIBLE: 2, LIKELY: 3, VERY_LIKELY: 4 };

// A children's app: adult content is refused even when only "possible"; violence and racy from "likely"; gore-like medical from "very likely".
function safe(a: Annotation | undefined) {
  if (!a) return false;
  return RANK[a.adult ?? 'UNKNOWN'] < 2 && RANK[a.violence ?? 'UNKNOWN'] < 3 && RANK[a.racy ?? 'UNKNOWN'] < 3 && RANK[a.medical ?? 'UNKNOWN'] < 4;
}

export type VisionImage = { base64: string } | { uri: string };

// Returns one verdict per image, in order. If the check itself fails, images are treated as unsafe (fail closed).
export const safeSearch = (images: VisionImage[]) => vision.safeSearch(images);

// Swappable in tests.
export const vision = { safeSearch: annotate };

async function annotate(images: VisionImage[]): Promise<boolean[]> {
  if (!images.length) return [];
  try {
    const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      // A developer's own gcloud login needs the project named for quota; the Cloud Run service account bills its own project.
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(LOCAL && { 'x-goog-user-project': PROJECT }) },
      body: JSON.stringify({
        requests: images.map((img) => ({
          image: 'base64' in img ? { content: img.base64 } : { source: { imageUri: img.uri } },
          features: [{ type: 'SAFE_SEARCH_DETECTION' }],
        })),
      }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      console.error('safesearch failed', res.status, JSON.stringify(data).slice(0, 300));
      return images.map(() => false);
    }
    await addSpent(USD_PER_IMAGE * images.length, 'safesearch');
    return (data.responses ?? []).map((r: any) => !r.error && safe(r.safeSearchAnnotation));
  } catch (e) {
    console.error('safesearch error', e);
    return images.map(() => false);
  }
}
