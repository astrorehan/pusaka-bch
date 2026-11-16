import { Link } from 'react-router-dom';

export function NotFoundScreen() {
  return (
    <div className="column enter" style={{ textAlign: 'center', paddingTop: 96 }}>
      <h1>This page doesn't exist</h1>
      <p className="muted" style={{ marginTop: 12 }}>Check the link, or start from the home page.</p>
      <p style={{ marginTop: 24 }}><Link to="/">Go home</Link></p>
    </div>
  );
}
