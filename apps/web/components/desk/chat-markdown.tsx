import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render streamed message text without executing model-supplied HTML. */
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
}: {
  text: string;
}) {
  return (
    <div className="chat-markdown min-w-0 whitespace-normal [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;
            const external = /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Table"
              tabIndex={0}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});
