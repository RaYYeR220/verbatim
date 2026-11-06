import "./landing.css";
import { Hero } from "./Hero";
import {
  AgentNative,
  HowItWorks,
  LandingFooter,
  Verified,
} from "./LandingSections";

export function LandingPage() {
  return (
    <div className="vbl">
      <main>
        <Hero />
        <HowItWorks />
        <Verified />
        <AgentNative />
      </main>
      <LandingFooter />
      <div className="vbl-grain" aria-hidden="true" />
    </div>
  );
}
