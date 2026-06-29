import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { Pipeline } from './components/Pipeline';
import { Compare } from './components/Compare';
import { Quickstart } from './components/Quickstart';
import { Packages } from './components/Packages';
import { SelfHost } from './components/SelfHost';
import { Footer } from './components/Footer';

export function App() {
  return (
    <>
      {/* Skip-to-content for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-surface focus:text-foreground focus:rounded-lg focus:border focus:border-lens focus:shadow-lg"
      >
        Skip to main content
      </a>

      <Nav />

      <main id="main-content">
        <Hero />
        <Features />
        <Pipeline />
        <Compare />
        <Quickstart />
        <Packages />
        <SelfHost />
      </main>

      <Footer />
    </>
  );
}
