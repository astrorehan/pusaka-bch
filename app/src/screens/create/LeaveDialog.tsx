import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';

interface Props {
  open: boolean;
  onStay(): void;
  onSave(): void;
  onLeave(): void;
}

/** "Leave without saving?" on the shared Sheet. Escape, the scrim and the close button all mean stay. */
export function LeaveDialog({ open, onStay, onSave, onLeave }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onStay}
      size="sm"
      title="Leave without saving?"
      description="Your heirs can't claim without this link. Pusaka keeps no copy of it."
      footer={
        <>
          <Button size="lg" block onClick={onSave}>Save plan link</Button>
          <Button variant="ghost" block className="cr-danger-text" onClick={onLeave}>Leave anyway</Button>
        </>
      }
    />
  );
}
