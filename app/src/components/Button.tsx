// Buttons. One primary button per screen (DESIGN.md "Layout").
//
//   <Button variant="primary" size="lg" block icon={<Send />} loading={busy} onClick={…}>Send to heirs</Button>
//   <ButtonLink to="/new" variant="secondary">Create a plan</ButtonLink>           (router link)
//   <ButtonLink href="https://…" external variant="ghost">GitHub</ButtonLink>     (plain <a>, new tab)
//
// Both share every variant, size, the icon slot and the press motion. A changed text label (Sign, Sending…, Sent)
// fades in over 200 ms; the first render never animates.
import { useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './button.css';

interface Look {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  /** full width (phones: the one primary button sits at the bottom, full width) */
  block?: boolean;
  icon?: ReactNode;
}

function classes({ variant = 'primary', size = 'md', block }: Look, extra = '') {
  return `btn btn--${variant} btn--${size}${block ? ' btn--block' : ''}${extra ? ' ' + extra : ''}`;
}

/** The label span. Keyed by its text so a new label remounts and fades in, but only after the first change. */
function Label({ children }: { children: ReactNode }) {
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null;
  const [prev, setPrev] = useState(text);
  const [changed, setChanged] = useState(false);
  if (prev !== text) {
    setPrev(text);
    setChanged(true);
  }
  return (
    <span key={text ?? undefined} className={`btn__label${changed ? ' btn__label--swap' : ''}`}>
      {children}
    </span>
  );
}

interface ButtonProps extends Look, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant, size, block, icon, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <span className="btn__icon" aria-hidden>{icon}</span>}
      <Label>{children}</Label>
    </button>
  );
}

type RouterLinkProps = Look & Omit<LinkProps, 'className'> & { href?: never; external?: never; className?: string };
type AnchorProps = Look & AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  to?: never;
  /** opens in a new tab with rel="noreferrer" */
  external?: boolean;
};

export function ButtonLink(props: RouterLinkProps | AnchorProps) {
  const { variant, size, block, icon, children, className = '' } = props;
  const look = classes({ variant, size, block }, className);
  const inner = (
    <>
      {icon && <span className="btn__icon" aria-hidden>{icon}</span>}
      <Label>{children}</Label>
    </>
  );
  if ('to' in props && props.to !== undefined) {
    const { variant: _v, size: _s, block: _b, icon: _i, className: _c, children: _ch, ...rest } = props;
    return <Link {...rest} className={look}>{inner}</Link>;
  }
  const { variant: _v, size: _s, block: _b, icon: _i, className: _c, children: _ch, external, ...rest } = props as AnchorProps;
  return (
    <a {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest} className={look}>
      {inner}
    </a>
  );
}
