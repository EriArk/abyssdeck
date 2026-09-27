import { type ComponentProps, useRef } from "react";
import { ProjectOverview } from "./ProjectOverview";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
export function ProjectOverviewModal({
  onClose,
  ...props
}: ComponentProps<typeof ProjectOverview> & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog);
  const action = (callback: (() => void) | undefined) =>
    callback
      ? () => {
          onClose();
          callback();
        }
      : undefined;
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="project-overview-modal"
      aria-label={`Обзор проекта ${props.scope.name}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <ProjectOverview
        {...props}
        onClose={onClose}
        onTarget={(target) => {
          onClose();
          props.onTarget(target);
        }}
        onNotebook={props.onNotebook}
        onNew={action(props.onNew)}
        onFiles={props.onFiles}
        onGit={props.onGit}
        onMachines={props.onMachines}
        onResults={action(props.onResults)}
        onRemote={action(props.onRemote)}
        onProjectGpt={props.onProjectGpt}
      />
    </dialog>
  );
}
