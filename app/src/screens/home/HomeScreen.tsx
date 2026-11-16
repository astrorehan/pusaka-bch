import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';

// Placeholder. Owner: screens/home worker.
export function HomeScreen() {
  return (
    <div className="column enter">
      <Logo size={96} bloom="once" />
      <h1>Your BCH reaches your family. Even if you can't.</h1>
      <p className="muted">Choose your heirs and their shares. If you stop checking in, they receive it automatically, with no company in between.</p>
      <p><Link to="/new">Create a plan</Link> · <Link to="/try">Try it now</Link></p>
    </div>
  );
}
