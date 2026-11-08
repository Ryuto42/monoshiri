export type Box = [number, number, number, number];

export type DetectedObject = { label: string; en: string; box: Box; alts?: string[] };

export type Topic = { id: string; title: string; teaser: string; kind: string; icon: string };

export type Explore = {
  id: string;
  label: string;
  name: string;
  reading: string;
  en: string;
  category: string;
  icon: string;
  oneLiner: string;
  summary: string;
  funFact: string;
  topics: Topic[];
  keywords: string[];
  entryPoint: string | null;
  queries: string[];
  wiki: { title: string; extract: string; url: string; thumb: string | null } | null;
  cached?: boolean;
  /** True only in the response to the person whose request created this explanation. */
  firstFind?: boolean;
};

export type Source = { title: string; uri: string };

export type DeepMeta = { sources: Source[]; queries: string[]; entryPoint: string | null };

export type DeepNote = { topicId: string; title: string; icon: string; text: string; sources: Source[]; diagram?: string; video?: string };

export type Card = {
  id: string;
  name: string;
  reading: string;
  en: string;
  category: string;
  icon: string;
  oneLiner: string;
  summary: string;
  funFact: string;
  topics: Topic[];
  notes: DeepNote[];
  illustration: string | null;
  /** This person was the first to explore the thing in Monoshiri. */
  firstFind?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CommonsImage = { thumb: string; full: string; page: string; title: string; artist: string; license: string; width: number; height: number };
export type Video = { id: string; title: string; channel: string; thumb: string };
export type Quiz = { questions: { q: string; choices: string[]; answer: number; explain: string }[] };
