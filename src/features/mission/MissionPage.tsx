import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMission } from '../../data/missions';
import { useGameStore } from '../../store/useGameStore';
import { buildMissionQuiz } from '../../game/engine/questions';
import { freeHintsFor } from '../../game/engine/hints';
import type { MissionOutcome } from '../../game/engine/events';
import { QuizRunner } from '../../components/quiz/QuizRunner';
import { InteractivePanel } from './InteractivePanel';
import type { AnswerRecord, Mission, QuizQuestion } from '../../types';

type Phase = 'intro' | 'practice' | 'quiz' | 'result';

/** Keyed by mission id so navigating between missions always starts fresh. */
export default function MissionPage() {
  const { id } = useParams();
  const mission = getMission(id ?? '');
  if (!mission) {
    return (
      <div className="max-w-3xl mx-auto glass p-6">
        <p>Mission not found.</p>
        <Link to="/" className="btn mt-3 inline-block">Home</Link>
      </div>
    );
  }
  return <MissionFlow key={mission.id} mission={mission} />;
}

function MissionFlow({ mission }: { mission: Mission }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const ageMode = useGameStore((s) => s.progress.ageMode);
  const [phase, setPhase] = useState<Phase>('intro');
  const [quiz, setQuiz] = useState<{ seed: string; questions: QuizQuestion[] } | null>(null);
  const [result, setResult] = useState<MissionOutcome | null>(null);

  const startQuiz = () => {
    // New numbers on every attempt: the seed is the attempt number.
    const attempts = useGameStore.getState().progress.missions[mission.id]?.attempts ?? 0;
    const seed = String(attempts + 1);
    setQuiz({ seed, questions: buildMissionQuiz(mission, seed) });
    setPhase('quiz');
  };

  const finish = (answers: AnswerRecord[]) => {
    if (!quiz) return;
    const { outcome } = dispatch({ type: 'MISSION_QUIZ_SUBMITTED', missionId: mission.id, seed: quiz.seed, answers });
    if (outcome.kind === 'mission') {
      setResult(outcome);
      setPhase('result');
    }
  };

  const retry = () => {
    setPhase('intro');
    setQuiz(null);
    setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`/world/${mission.world}`} className="btn">← Back</Link>
        <h1 className="text-2xl font-bold">{mission.title}</h1>
      </div>

      {phase === 'intro' && (
        <div className="glass p-6 space-y-3">
          <h2 className="font-semibold">Intro</h2>
          {mission.intro.map((b, i) => (
            <div key={i}>
              {b.type === 'equation' ? <code className="block bg-black/30 p-2 rounded">{b.value}</code> : <p>{b.value}</p>}
            </div>
          ))}
          <div className="space-y-3 mt-4">
            {mission.steps
              .filter((s) => s.kind === 'guided')
              .map((s) => (
                <div key={s.id}>
                  <p className="opacity-80 text-sm mb-1">{s.prompt}</p>
                  {s.interactive && <InteractivePanel kind={s.interactive} />}
                </div>
              ))}
          </div>
          <button className="btn primary mt-4" onClick={() => setPhase('practice')}>Practice →</button>
        </div>
      )}

      {phase === 'practice' && (
        <div className="glass p-6 space-y-3">
          <h2 className="font-semibold">Practice</h2>
          {mission.steps
            .filter((s) => s.kind === 'practice')
            .map((s) => (
              <div key={s.id} className="space-y-2">
                <p className="opacity-80 text-sm">{s.prompt}</p>
                {s.interactive && <InteractivePanel kind={s.interactive} />}
              </div>
            ))}
          <button className="btn primary mt-4" onClick={startQuiz}>Take Quiz →</button>
        </div>
      )}

      {phase === 'quiz' && quiz && (
        <QuizRunner questions={quiz.questions} freeHints={freeHintsFor(ageMode)} onFinish={finish} />
      )}

      {phase === 'result' && result && (
        <div className="glass p-6 space-y-3 text-center" data-testid="mission-result">
          <h2 className="text-2xl font-bold">Result</h2>
          <p>Score: {result.score.points} · Correct: {result.correct}/{result.total}</p>
          <p aria-label={`${result.score.stars} of 3 stars`}>
            Stars: {'★'.repeat(result.score.stars)}{'☆'.repeat(3 - result.score.stars)}
          </p>
          {result.score.speedBonus > 0 && <p className="text-sm opacity-80">Speed bonus: +{result.score.speedBonus}</p>}
          {result.hintsUsed > 0 && <p className="text-sm opacity-80">Hints used: {result.hintsUsed}</p>}
          {result.score.bonuses.length > 0 && (
            <p className="text-sm opacity-80">Bonuses: {result.score.bonuses.join(', ')}</p>
          )}
          {result.newBest && result.score.points > 0 && <p className="text-sm font-semibold">New personal best!</p>}
          <p className="opacity-70 text-sm">
            {result.score.stars === 0
              ? 'Earn at least 1★ to collect rewards.'
              : result.firstClear
                ? `First clear! Quanta earned: ${result.quanta}`
                : `Replay reward: ${result.quanta} Quanta`}
          </p>
          {result.bossUnlocked && (
            <p className="font-semibold">
              🔥 A boss has appeared!{' '}
              <Link to={`/boss/${mission.world}`} className="underline">Challenge it</Link>
            </p>
          )}
          <div className="flex gap-3 justify-center mt-4">
            <button className="btn" onClick={retry}>Retry</button>
            <Link to={`/world/${mission.world}`} className="btn primary">Back to World</Link>
          </div>
        </div>
      )}
    </div>
  );
}
