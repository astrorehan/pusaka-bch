// A full-area state (empty, not found, error): centred in the content area with a way forward
// (DESIGN.md "States"). Used by the plan page's messages and the 404 page, so they look the same.
//
//   <StateMessage icon={<SearchX />} title="We can't find this plan" text="…" actions={<Button …/>} />
import type { ReactNode } from 'react';
import './state-message.css';

interface Props {
  icon: ReactNode;
  title: string;
  text: ReactNode;
  /** extra content between the text and the buttons (e.g. a form) */
  children?: ReactNode;
  actions?: ReactNode;
}

export function StateMessage({ icon, title, text, children, actions }: Props) {
  return (
    <div className="state-msg enter">
      <span className="state-msg__icon" aria-hidden>{icon}</span>
      <h1 className="state-msg__title">{title}</h1>
      <p className="state-msg__text">{text}</p>
      {children}
      {actions && <div className="state-msg__actions">{actions}</div>}
    </div>
  );
}
