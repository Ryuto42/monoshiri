import { useEffect, useRef } from 'react';

// Google Search Suggestions must be shown unmodified, so they live in a shadow root that our styles can't touch.
export function SearchEntry({ html }: { html: string | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = html;
    root.querySelectorAll('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }, [html]);
  if (!html) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[12px] font-bold text-ink-3">Google の検索候補</p>
      <div ref={ref} className="w-full" />
    </div>
  );
}
