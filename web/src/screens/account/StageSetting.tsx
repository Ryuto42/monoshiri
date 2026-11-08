import { stageInfo, type Stage } from '../../lib/level';
import { RubyText } from '../../components/RubyText';
import { Icon } from '../../components/ui';

export function StageRow({ stage, onEdit }: { stage: Stage | null; onEdit: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-3xl bg-paper-2 px-4 py-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="school" size={24} fill />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-black">{stage ? <RubyText text={stageInfo(stage).ruby} /> : '標準'}向けの説明</p>
        <p className="text-[12px] leading-snug text-ink-2">年齢を入れると、ことばやくわしさを合わせます</p>
      </div>
      <button onClick={onEdit} className="h-11 shrink-0 rounded-full bg-paper px-4 text-[13px] font-bold text-ink shadow-[var(--shadow-card)]">
        変更
      </button>
    </div>
  );
}
