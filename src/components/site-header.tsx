import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link className="wordmark" href="/" aria-label="Castyard home" prefetch={false}>
          Castyard<span className="wordmark-dot">.</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link href="/agents" prefetch={false}>Discover</Link>
          <Link href="/compare" prefetch={false}>Compare</Link>
          <Link href="/evidence" prefetch={false}>Evidence</Link>
        </nav>
        <span className="source-live">BSC source online</span>
      </div>
      <div className="identity-caution">Registration proves identity, not performance or safety.</div>
    </header>
  );
}
