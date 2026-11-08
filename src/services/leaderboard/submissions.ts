// Turns finished runs into leaderboard submissions (pure).
import type { EventResult, GameEvent } from '../../game/engine/events';
import { paidHints } from '../../game/engine/hints';
import type { AnswerRecord } from '../../types';
import type { LogEntry, ScoreSubmission } from './types';

function toLog(answers: readonly AnswerRecord[]): LogEntry[] {
  return answers.map((a) => ({ t: Math.max(0, Math.round(a.timeMs)), c: a.correct, h: Math.min(3, paidHints(a.hintsUsed, a.freeHints)) }));
}

function summary(log: LogEntry[]) {
  return { timeMs: log.reduce((s, e) => s + e.t, 0), correct: log.filter((e) => e.c).length, answered: log.length };
}

/**
 * Leaderboard entry for a processed event, or null if it does not belong on a board:
 * challenge runs with points, first (non-practice) daily runs, and boss victories.
 */
export function buildSubmission(event: GameEvent, result: EventResult, clientId: string, now: number): ScoreSubmission | null {
  const o = result.outcome;
  if (o.kind === 'challenge' && event.type === 'CHALLENGE_FINISHED') {
    if (o.score <= 0) return null;
    const log = toLog(o.answers);
    return { clientId, kind: 'challenge', board: `challenge:${o.mode}:${o.timing}`, score: o.score, seed: event.seed, log, finishedAt: now, ...summary(log) };
  }
  if (o.kind === 'daily' && event.type === 'DAILY_CHALLENGE_SUBMITTED') {
    if (o.practice) return null;
    const log = toLog(o.answers);
    return { clientId, kind: 'daily', board: `daily:${o.date}:${o.tier}`, score: o.score.points, seed: `daily:${o.date}:${o.tier}`, log, finishedAt: now, ...summary(log) };
  }
  if (o.kind === 'boss' && event.type === 'BOSS_BATTLE_FINISHED') {
    if (!o.won) return null;
    const log = toLog(o.answers);
    return { clientId, kind: 'boss', board: `boss:${o.bossId}`, score: o.heartsLeft, seed: event.seed, log, finishedAt: now, ...summary(log) };
  }
  return null;
}
