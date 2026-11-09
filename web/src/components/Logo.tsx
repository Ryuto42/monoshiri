import { BrandMark } from './BrandMark';

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${light ? 'text-white drop-shadow-[0_1px_8px_rgb(0_0_0/0.35)]' : 'text-ink'}`}>
      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-accent text-white">
        <BrandMark size={22} />
      </span>
      <span className="text-[22px] font-black tracking-wide">モノシリ</span>
    </span>
  );
}
