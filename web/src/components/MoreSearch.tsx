import { openExternal } from '../lib/native';
import { stripRuby } from '../lib/ruby';
import { SearchEntry } from './SearchEntry';
import { Button, Icon } from './ui';

// Searching outside the app sits at the end, after the explanation and the topics, the same on the result and the card.
export function MoreSearch({ name, entry }: { name: string; entry: string | null | undefined }) {
  return (
    <section className="mt-8" aria-labelledby="more-search">
      <h3 id="more-search" className="flex items-center gap-2 text-[18px] font-black">
        <Icon name="search" size={22} className="text-accent" />
        もっと調べる
      </h3>
      <Button
        tone="paper"
        icon="open_in_new"
        className="mt-3"
        onClick={() => openExternal(`https://www.google.com/search?q=${encodeURIComponent(stripRuby(name))}`)}
      >
        Googleで調べる
      </Button>
      <SearchEntry html={entry} />
    </section>
  );
}
