import { challengeRules, questionLimitMs, type ChallengeMode, type ChallengeTiming } from '../../game/engine/challenge';

/** Human-readable rules for a mode and timing (derived from the engine's rules). */
export function describeRules(mode: ChallengeMode, timing: ChallengeTiming): string {
  const rules = challengeRules(mode, timing);
  const secs = (ms: number | null) => (ms === null ? '' : `${Math.round(ms / 1000)} s`);
  const hint = timing === 'untimed' ? 'Hints cost 25% of a question’s points.' : `Hints cost ${secs(rules.hintPenaltyMs)}.`;
  switch (mode) {
    case 'blitz':
      return rules.totalMs === null
        ? `Answer ${rules.maxQuestions} questions at your own pace. ${hint}`
        : `Answer as many as you can in ${secs(rules.totalMs)}. ${hint}`;
    case 'sprint':
      return `${rules.maxQuestions} questions${timing === 'untimed' ? '' : `, ${secs(questionLimitMs(rules, 0))} each`}. Faster answers score more. ${hint}`;
    case 'survival':
      return `${rules.lives} lives. Questions get harder${timing === 'untimed' ? '' : ' and faster'} every 5 answers. ${hint}`;
  }
}

