// Placeholder. Owner: screens/plan worker.
export function PlanScreen({ demo = false }: { demo?: boolean }) {
  return <div className="column enter"><h1>{demo ? 'Demo plan' : 'Your plan'}</h1></div>;
}
