import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bossForWorld } from '../../data/bosses';
import { LAWS } from '../../data/laws';
import { CONSTANTS } from '../../data/constants';
import { useGameStore } from '../../store/useGameStore';
import {
  applyBossAnswer,
  bossDamage,
  bossStagePools,
  bossUnlockStatus,
  nextBossQuestion,
  startBossBattle,
  BOSS_MAX_HEARTS,
  BOSS_MAX_HP,
  type BossBattle,
} from '../../game/engine/boss';
import { freeHintsFor } from '../../game/engine/hints';
import type { BossOutcome } from '../../game/engine/events';
import { QuestionCard } from '../../components/quiz/QuestionCard';
import type { AnswerRecord, Boss, QuizQuestion } from '../../types';
import { formatDuration } from '../../lib/time';

export default function BossPage() {
  const { world } = useParams();
  const boss = bossForWorld(world ?? '');
  const progress = useGameStore((s) => s.progress);

  if (!boss) {
    return (
      <div className="max-w-3xl mx-auto glass p-6">
        <p>No boss lives here.</p>
        <Link to="/" className="btn mt-3 inline-block">Home</Link>
      </div>
    );
  }

  const unlock = bossUnlockStatus(progress, boss.world);
  if (!progress.unlockedWorlds.includes(boss.world) || !unlock.unlocked) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackLink boss={boss} />
        <div className="glass p-6 space-y-2 text-center">
          <div className="text-6xl opacity-40" aria-hidden="true">{boss.emoji}</div>
          <h1 className="text-2xl font-bold">{boss.name} is sleeping</h1>
          <p className="opacity-80">
            Complete {unlock.needed} of {unlock.total} missions in this world to wake it up ({unlock.done}/{unlock.needed} done).
          </p>
        </div>
      </div>
    );
  }

  return <BossArena key={boss.id} boss={boss} />;
}

function BackLink({ boss }: { boss: Boss }) {
  return (
    <Link to={`/world/${boss.world}`} className="btn inline-block">
      ← Back
    </Link>
  );
}

interface Fight {
  pools: [QuizQuestion[], QuizQuestion[], QuizQuestion[]];
  battle: BossBattle;
  question: QuizQuestion;
  lastRecord: AnswerRecord | null;
}

function BossArena({ boss }: { boss: Boss }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const record = useGameStore((s) => s.progress.bosses[boss.id]);
  const ageMode = useGameStore((s) => s.progress.ageMode);
  const [fight, setFight] = useState<Fight | null>(null);
  const [outcome, setOutcome] = useState<BossOutcome | null>(null);

  const begin = () => {
    const attempts = useGameStore.getState().progress.bosses[boss.id]?.attempts ?? 0;
    const seed = String(attempts + 1);
    const pools = bossStagePools(boss, seed);
    const battle = startBossBattle(boss, seed);
    const question = nextBossQuestion(battle, pools);
    if (!question) return;
    setOutcome(null);
    setFight({ pools, battle, question, lastRecord: null });
  };

  const finish = (battle: BossBattle) => {
    const result = dispatch({ type: 'BOSS_BATTLE_FINISHED', bossId: boss.id, seed: battle.seed, answers: battle.answers });
    if (result.outcome.kind === 'boss') setOutcome(result.outcome);
    setFight(null);
  };

  if (outcome) return <BossResult boss={boss} outcome={outcome} onRematch={begin} />;

  if (!fight) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackLink boss={boss} />
        <div className="glass p-6 space-y-4 text-center">
          <div className="text-7xl" aria-hidden="true">{boss.emoji}</div>
          <h1 className="text-3xl font-bold">{boss.name}</h1>
          <p className="opacity-80 max-w-xl mx-auto">{boss.lore}</p>
          <ul className="text-sm opacity-90 text-left max-w-md mx-auto list-disc pl-5 space-y-1">
            <li>The boss has {BOSS_MAX_HP} HP over 3 stages that get harder.</li>
            <li>Each correct answer deals 10 damage (less if you use hints).</li>
            <li>You have {BOSS_MAX_HEARTS} hearts — every wrong answer costs one.</li>
          </ul>
          {record && record.attempts > 0 && (
            <p className="text-sm opacity-80" data-testid="boss-record">
              Attempts: {record.attempts}
              {record.defeated && ` · Best: ${'❤️'.repeat(record.bestHeartsLeft)} in ${formatDuration(record.bestTimeMs ?? 0)}`}
            </p>
          )}
          <button className="btn primary" onClick={begin}>
            {record?.defeated ? 'Rematch' : 'Begin battle'}
          </button>
        </div>
      </div>
    );
  }

  const { battle, question, pools, lastRecord } = fight;
  const stage = boss.stages[battle.stage];
  const over = battle.status !== 'fighting';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="glass p-5 space-y-3" data-testid="boss-hud">
        <div className="flex items-center gap-4">
          <div key={battle.answers.length} className={`text-5xl ${lastRecord?.correct ? 'boss-hit' : ''}`} aria-hidden="true">
            {boss.emoji}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-xl font-bold">{boss.name}</h1>
            <p className="text-sm opacity-80">
              Stage {battle.stage + 1} of 3 — {stage.name}
            </p>
            <div
              className="hp-bar"
              role="progressbar"
              aria-label={`${boss.name} HP`}
              aria-valuemin={0}
              aria-valuemax={BOSS_MAX_HP}
              aria-valuenow={battle.hp}
              aria-valuetext={`${battle.hp} of ${BOSS_MAX_HP} HP`}
            >
              <div style={{ width: `${(battle.hp / BOSS_MAX_HP) * 100}%` }} />
            </div>
            <p className="text-xs opacity-70">
              HP {battle.hp}/{BOSS_MAX_HP}
            </p>
          </div>
          <div className="text-xl whitespace-nowrap" role="img" aria-label={`Hearts: ${battle.hearts} of ${BOSS_MAX_HEARTS}`}>
            {'❤️'.repeat(Math.max(0, battle.hearts))}
            {'🤍'.repeat(BOSS_MAX_HEARTS - Math.max(0, battle.hearts))}
          </div>
        </div>
        <p className="italic opacity-90">“{stage.taunt}”</p>
      </div>

      <QuestionCard
        key={`${battle.seed}:${battle.answers.length - (lastRecord ? 1 : 0)}:${question.id}`}
        question={question}
        freeHints={freeHintsFor(ageMode)}
        autoFocus={battle.answers.length > 0}
        nextLabel={over ? 'See outcome' : 'Next question →'}
        onChecked={(rec) => {
          setFight((f) => (f ? { ...f, battle: applyBossAnswer(f.battle, rec, f.pools), lastRecord: rec } : f));
        }}
        afterFeedback={
          lastRecord && (
            <p className="mt-2 font-semibold" data-testid="boss-feedback">
              {lastRecord.correct ? `💥 You dealt ${bossDamage(lastRecord)} damage!` : '💔 You lost a heart!'}
              {battle.status === 'won' && ` ${boss.name} is defeated!`}
              {battle.status === 'lost' && ' The battle is lost…'}
            </p>
          )
        }
        onNext={() => {
          if (over) {
            finish(battle);
            return;
          }
          const next = nextBossQuestion(battle, pools);
          if (next) setFight({ ...fight, question: next, lastRecord: null });
        }}
      />
      <div className="text-right">
        <button className="btn ghost text-sm" onClick={() => finish(battle)}>
          🏳️ Retreat
        </button>
      </div>
    </div>
  );
}

function BossResult({ boss, outcome, onRematch }: { boss: Boss; outcome: BossOutcome; onRematch: () => void }) {
  const lawNames = outcome.lawsAdded.map((id) => LAWS.find((l) => l.id === id)?.name ?? id);
  const constantNames = outcome.constantsAdded.map((id) => CONSTANTS.find((c) => c.id === id)?.name ?? id);
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink boss={boss} />
      <div className="glass p-6 space-y-3 text-center" data-testid="boss-result">
        <div className="text-6xl" aria-hidden="true">{outcome.won ? '🏆' : boss.emoji}</div>
        <h1 className="text-3xl font-bold">{outcome.won ? 'Victory!' : outcome.retreated ? 'You retreated' : 'Defeated…'}</h1>
        <p>
          {outcome.won
            ? `You defeated ${boss.name}!`
            : `${boss.name} stands firm. Study up and try again!`}
        </p>
        <p aria-label={`${outcome.stars} of 3 stars`}>
          {'★'.repeat(outcome.stars)}
          {'☆'.repeat(3 - outcome.stars)}
        </p>
        <p className="text-sm opacity-80">
          Damage dealt: {outcome.damageDealt}/{BOSS_MAX_HP} · Hearts left: {Math.max(0, outcome.heartsLeft)} · Time: {formatDuration(outcome.timeMs)}
        </p>
        {outcome.newBestTime && !outcome.firstDefeat && <p className="font-semibold">New best time!</p>}
        {outcome.won && (
          <p className="opacity-80 text-sm">
            {outcome.firstDefeat ? `First victory! Quanta earned: ${outcome.quanta}` : `Rematch reward: ${outcome.quanta} Quanta`}
          </p>
        )}
        {(lawNames.length > 0 || constantNames.length > 0) && (
          <div className="text-sm text-left max-w-md mx-auto glass p-3">
            <p className="font-semibold">📖 New Codex entries</p>
            {lawNames.length > 0 && <p>Laws: {lawNames.join(', ')}</p>}
            {constantNames.length > 0 && <p>Constants: {constantNames.join(', ')}</p>}
          </div>
        )}
        {outcome.unlockedWorld && (
          <p className="font-semibold">
            🔓 The <span className="capitalize">{outcome.unlockedWorld}</span> world is now open!{' '}
            <Link to={`/world/${outcome.unlockedWorld}`} className="underline">Enter it</Link>
          </p>
        )}
        <div className="flex gap-3 justify-center mt-4">
          <button className="btn" onClick={onRematch}>Rematch</button>
          <Link to={`/world/${boss.world}`} className="btn primary">Back to World</Link>
        </div>
      </div>
    </div>
  );
}
