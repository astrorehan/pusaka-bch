import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  /** full width (phones: the one primary button sits at the bottom, full width) */
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', block, icon, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size}${block ? ' btn--block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <span className="btn__icon" aria-hidden>{icon}</span>}
      <span className="btn__label">{children}</span>
    </button>
  );
}
