import type { GptFile, GptRichReference, IssueSource } from "@codex-web/shared";
import { projectContextEnd, projectContextStart } from "@codex-web/shared";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { artifactSource, useArtifactComponents } from "./ArtifactMarkdown";
import { terminalDevice } from "./DeviceWorkspaceHost";
import { gptLayoutComponents } from "./GptRichLayout";
import type { LayoutAction, LayoutStates } from "./gptLayoutState";
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
  citationFiles,
  richReferences,
}: {
  value: string;
  onArtifact?: (source: string) => void;
  resolveImage?: (source: string) => Promise<string | undefined>;
  complete?: boolean;
  issueSource?: IssueSource;
  rich?: boolean;
  citationFiles?: GptFile[];
  richReferences?: GptRichReference[];
}) {
  const [states, setStates] = useState<LayoutStates>({});
  const onAction = useCallback((actions: LayoutAction[], input?: string | number | boolean) => {
    setStates((old) => {
      const next = { ...old };
      for (const action of actions.slice(0, 100)) {
        const value = action.input ? input : action.value;
        if (value !== undefined)
          Object.defineProperty(next, action.key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
      return next;
    });
  }, []);
  const hasArtifacts = !!onArtifact;
  const artifactHandler = useRef(onArtifact);
  artifactHandler.current = onArtifact;
  const openCitation = useCallback((source: string) => artifactHandler.current?.(source), []);
  const artifacts = useArtifactComponents(onArtifact, resolveImage);
  const code = useIssueCode(value, onArtifact, complete, issueSource);
  const contextEnd = value.startsWith(projectContextStart) ? value.indexOf(projectContextEnd) : -1;
  const components = useMemo(
    () =>
      gptLayoutComponents(
        {
          pre: code,
          table: MarkdownTable,
          ...artifacts,
        },
        {
          richReferences,
          onAction,
          files: citationFiles,
          onOpen: hasArtifacts ? openCitation : undefined,
        },
      ),
    [code, artifacts, richReferences, citationFiles, hasArtifacts, openCitation, onAction],
  );
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
          remarkPlugins={rich ? [remarkGfm, [remarkGptLayout, { states }]] : [remarkGfm]}
          rehypePlugins={[rehypeImageGallery]}
          components={components}
        >
          {contextEnd >= 0 ? value.slice(contextEnd + projectContextEnd.length) : value}
        </Markdown>
      </>
    ),
    [value, hasArtifacts, contextEnd, rich, states, components],
  );
});
