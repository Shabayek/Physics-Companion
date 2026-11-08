import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  children: ReactNode;
}

export function Button({ variant = 'default', className, children, ...rest }: Props) {
  const base = 'btn';
  const v = variant === 'primary' ? 'primary' : variant === 'ghost' ? 'ghost' : '';
  return (
    <button className={cn(base, v, className)} {...rest}>
      {children}
    </button>
  );
}
