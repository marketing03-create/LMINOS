import { HowItWorks } from "./how-it-works";

export default function HowItWorksPage() {
  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">How LMIROS works</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A plain-English guide — from zero to hero. Pick a topic on the left.
        </p>
      </header>
      <HowItWorks />
    </div>
  );
}
