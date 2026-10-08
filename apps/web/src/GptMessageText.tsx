import type { IssueSource } from "@codex-web/shared";
import { projectContextEnd, projectContextStart } from "@codex-web/shared";
import { memo, useMemo } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { artifactSource, useArtifactComponents } from "./ArtifactMarkdown";
import { terminalDevice } from "./DeviceWorkspaceHost";
import { gptLayoutComponents } from "./GptRichLayout";
import { remarkGptLayout } from "./gptRichMarkdown";
import { rehypeImageGallery } from "./ImageGallery";
import { useIssueCode } from "./IssueDrawer";
import { MarkdownTable } from "./MarkdownTable";
export const GptMessageText = memo(function GptMessageText({
  value,
  onArtifact,
  resolveImage,
  complete = true,
  issueSource,
  rich = false,
}: {
  value: string;
  onArtifact?: (source: string) => void;
  resolveImage?: (source: string) => Promise<string | undefined>;
  complete?: boolean;
  issueSource?: IssueSource;
  rich?: boolean;
}) {
  const hasArtifacts = !!onArtifact;
  const artifacts = useArtifactComponents(onArtifact, resolveImage);
  const code = useIssueCode(value, onArtifact, complete, issueSource);
  const contextEnd = value.startsWith(projectContextStart) ? value.indexOf(projectContextEnd) : -1;
  // Drawer, draft and job updates must not reparse unchanged replies. Keep the
  // latest handler separately so cached links still target the current message.
  return useMemo(
    () => (
      <>
        {contextEnd >= 0 && (
          <details className="project-gpt-envelope">
            <summary>Контекст проекта</summary>
            <pre>{value.slice(projectContextStart.length, contextEnd)}</pre>
          </details>
        )}
        <Markdown
          urlTransform={(url) =>
            terminalDevice(url) || (hasArtifacts && artifactSource(url))
              ? url
              : defaultUrlTransform(url)
          }
          remarkPlugins={rich ? [remarkGfm, remarkGptLayout] : [remarkGfm]}
          rehypePlugins={[rehypeImageGallery]}
          components={gptLayoutComponents({
            pre: code,
            table: MarkdownTable,
            ...artifacts,
          })}
        >
          {contextEnd >= 0 ? value.slice(contextEnd + projectContextEnd.length) : value}
        </Markdown>
      </>
    ),
    [value, hasArtifacts, contextEnd, artifacts, code, rich],
  );
});
