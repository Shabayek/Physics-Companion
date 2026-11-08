import { useRef, useState } from 'react';
import type { AnswerRecord, QuizQuestion } from '../../types';
import { gameNow } from '../../store/useGameStore';
import { QuestionCard } from './QuestionCard';

export interface QuizRunnerProps {
  questions: QuizQuestion[];
  /** Free hints per question (Kid mode: 1). */
  freeHints?: number;
  /** Called once with all answers after the last question. */
  onFinish: (answers: AnswerRecord[]) => void;
  /** Called after each checked answer. */
  onAnswer?: (record: AnswerRecord, index: number) => void;
  /** Clock (defaults to the game clock) — answering time excludes time spent reading feedback. */
  now?: () => number;
  finishLabel?: string;
}

/** A fixed sequence of questions, one at a time (missions, daily challenge). */
export function QuizRunner({ questions, freeHints = 0, onFinish, onAnswer, now = gameNow, finishLabel = 'See results' }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const records = useRef<AnswerRecord[]>([]);
  const question = questions[index];
  if (!question) return null;
  const isLast = index === questions.length - 1;
  const done = index + (answered ? 1 : 0);

  return (
    <QuestionCard
      key={`${index}:${question.id}`}
      question={question}
      freeHints={freeHints}
      now={now}
      autoFocus={index > 0}
      nextLabel={isLast ? finishLabel : 'Next question →'}
      onChecked={(record) => {
        setAnswered(true);
        onAnswer?.(record, index);
      }}
      onNext={(record) => {
        records.current = [...records.current, record];
        if (isLast) {
          onFinish(records.current);
          return;
        }
        setAnswered(false);
        setIndex((i) => i + 1);
      }}
      header={
        <>
          <div className="flex items-center justify-between text-sm opacity-80">
            <span>
              Question {index + 1} of {questions.length}
            </span>
            {question.difficulty > 1 && (
              <span aria-label={`Difficulty ${question.difficulty} of 3`}>{'◆'.repeat(question.difficulty)}</span>
            )}
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Quiz progress"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={done}
          >
            <div style={{ width: `${(done / questions.length) * 100}%` }} />
          </div>
        </>
      }
    />
  );
}
