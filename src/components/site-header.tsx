/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta Link navigation throws in production. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-row">
        <a className="wordmark" href="/" aria-label="Castyard home">
          Castyard<span className="wordmark-dot">.</span>
        </a>
        <nav className="primary-nav" aria-label="Primary navigation">
          <a href="/agents">Discover</a>
          <a href="/compare">Compare</a>
          <a href="/evidence">Evidence</a>
        </nav>
        <span className="source-live">BSC source online</span>
      </div>
      <div className="identity-caution">Registration proves identity, not performance or safety.</div>
    </header>
  );
}
