import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useHashRoute } from './lib/hooks';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Diagnosis from './pages/Diagnosis';
import Agents from './pages/Agents';
import Simulation from './pages/Simulation';
import Scenarios from './pages/Scenarios';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Rag from './pages/Rag';
import Cases from './pages/Cases';
import Reports from './pages/Reports';
import About from './pages/About';

const PAGES: Record<string, React.ComponentType<{ query: URLSearchParams }>> = {
  '/': Home, '/dashboard': Dashboard, '/register': Register, '/diagnosis': Diagnosis, '/agents': Agents,
  '/simulation': Simulation, '/scenarios': Scenarios, '/knowledge-graph': KnowledgeGraph, '/rag': Rag,
  '/cases': Cases, '/reports': Reports, '/about': About,
};

class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) return <div className="glass p-6 text-rose-200">Something went wrong rendering this page: {this.state.err.message}</div>;
    return this.props.children;
  }
}

function App() {
  const [route] = useHashRoute();
  const [path, qs] = route.split('?');
  const Page = PAGES[path] || Home;
  return (
    <Layout route={path}>
      <Boundary key={path}>
        <Suspense fallback={<Spinner label="Loading" />}>
          <Page query={new URLSearchParams(qs || '')} />
        </Suspense>
      </Boundary>
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
