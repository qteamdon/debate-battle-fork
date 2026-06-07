import { observer } from "mobx-react-lite";
import { useEffect, useMemo } from "react";
import { marked } from "marked";
import { useResolve } from "@/tsyringe-hooks/useResolve";
import { ResultsStore, TOKEN_ResultsStore } from "@/stores/ResultsStore";
import { roleColor, roleName } from "@/lib/roleHues";

function MarkdownBlock({
  markdown,
  className,
}: {
  markdown: string;
  className: string;
}) {
  // The markdown comes from our own judge / agent subagents — it's trusted
  // text, not user input. marked() is safe enough here without DOMPurify.
  const html = useMemo(
    () => marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string,
    [markdown],
  );
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function VerdictBody({ markdown }: { markdown: string | null }) {
  if (!markdown) {
    return (
      <p className="results__empty">
        No judge verdict yet. The judge subagent posts the verdict via{" "}
        <code>debate_set_verdict</code> when it finishes scoring; the
        overlay will update live.
      </p>
    );
  }
  return <MarkdownBlock markdown={markdown} className="results__verdict" />;
}

const ResultsBody = observer(() => {
  const results = useResolve<ResultsStore>(TOKEN_ResultsStore);

  return (
    <>
      <header className="results__head">
        <div className="results__head-titles">
          <h2 className="results__head-name">Final Results</h2>
          <span className="results__head-sub">
            {results.ended
              ? "Debate concluded"
              : "Debate still in progress — preview"}
          </span>
        </div>
        <button
          type="button"
          className="results__refresh"
          onClick={() => void results.refresh()}
          disabled={results.loading}
          aria-label="Refresh results"
        >
          {results.loading ? "…" : "↻"}
        </button>
        <button
          type="button"
          className="results__close"
          onClick={() => results.close()}
          aria-label="Close results"
        >
          ×
        </button>
      </header>

      <div className="results__body">
        {results.error && (
          <div className="results__error">Error loading results: {results.error}</div>
        )}

        <section className="results__section">
          <h3 className="results__section-title">Judge's Verdict</h3>
          <VerdictBody markdown={results.verdictMarkdown} />
        </section>

        <section className="results__section">
          <h3 className="results__section-title">Debater Positions</h3>
          {results.rankedPositions.length === 0 ? (
            <p className="results__empty">No POSITION events have been published yet.</p>
          ) : (
            <ul className="results__positions">
              {results.rankedPositions.map(({ rank, position: p, finalMarkdown }) => (
                <li
                  key={p.agent_id}
                  className={
                    "results__position" + (rank != null ? " results__position--ranked" : "")
                  }
                  style={{ ["--agent-color" as string]: roleColor(p.agent_id) }}
                >
                  <div className="results__position-head">
                    {rank != null && (
                      <span className="results__position-rank" aria-label={`Rank ${rank}`}>
                        #{rank}
                      </span>
                    )}
                    <span
                      className="results__position-swatch"
                      style={{ background: roleColor(p.agent_id) }}
                      aria-hidden="true"
                    />
                    <span className="results__position-name">{roleName(p.agent_id)}</span>
                    <span className="results__position-meta">
                      @{p.agent_id} · {finalMarkdown ? "final" : `opening · pos ${p.position}`}
                    </span>
                  </div>
                  {finalMarkdown ? (
                    <MarkdownBlock
                      markdown={finalMarkdown}
                      className="results__position-final"
                    />
                  ) : (
                    <pre className="results__position-text">{p.text}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
});

export const ResultsOverlay = observer(() => {
  const results = useResolve<ResultsStore>(TOKEN_ResultsStore);

  useEffect(() => {
    if (!results.isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") results.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results.isOpen, results]);

  return (
    <>
      <div
        className={
          "results__backdrop" + (results.isOpen ? " results__backdrop--open" : "")
        }
        onClick={() => results.close()}
        aria-hidden="true"
      />
      <aside
        className={"results" + (results.isOpen ? " results--open" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Debate results"
        aria-hidden={!results.isOpen}
      >
        {results.isOpen && <ResultsBody />}
      </aside>
    </>
  );
});
