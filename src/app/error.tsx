"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="container route-page" role="alert">
      <p className="eyebrow">Source interruption</p>
      <h1 className="section-title">The live view could not be completed.</h1>
      <p className="lede">No fallback records were substituted. Retry the current source request.</p>
      <button className="button-primary" type="button" onClick={reset}>Retry live sources</button>
    </section>
  );
}
