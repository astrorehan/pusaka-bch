import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { ButtonLink } from '../components/Button';
import { StateMessage } from '../components/StateMessage';

export function NotFoundScreen() {
  useEffect(() => {
    document.title = 'Page not found · Pusaka';
    return () => { document.title = 'Pusaka'; };
  }, []);

  return (
    <div className="column">
      <StateMessage
        icon={<Compass />}
        title="This page doesn't exist"
        text="The link may be mistyped or out of date. A plan link always has /plan# in it."
        actions={
          <>
            <ButtonLink to="/" size="lg">Back to home</ButtonLink>
            <ButtonLink to="/try" variant="secondary" size="lg">Try it now</ButtonLink>
          </>
        }
      />
    </div>
  );
}
