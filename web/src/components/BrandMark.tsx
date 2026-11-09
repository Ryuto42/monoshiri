import markUrl from '../../assets/mark.svg';

// モノシリのマーク（虫眼鏡を掲げるキャラ）。アプリアイコン・撮影ボタン・ロゴで同じものを使う。
// 元は web/assets/mark.svg の1つだけ。マスクにして背景色で塗るので、文字色（currentColor）がそのまま付く。
// size は Material Symbols の Icon と同じ意味（1文字分の大きさ。絵柄はその約8割）。
const mask = `url(${JSON.stringify(markUrl)}) center / contain no-repeat`;

export function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: 'currentColor', mask, WebkitMask: mask }}
    />
  );
}
