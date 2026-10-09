import { icons as lucideIcons, type LucideIcon } from "lucide-react";
// Native content uses Lucide names. Resolve the catalogue instead of substituting
// unrelated application icons or silently drawing a circle for every unknown name.
export default function ContentIcon({ name, size }: { name: string; size: number }) {
  const key = name.replace(/(^|-)([a-z0-9])/g, (_, _separator, letter: string) =>
    letter.toUpperCase(),
  );
  const Component = Object.hasOwn(lucideIcons, key)
    ? (lucideIcons as unknown as Record<string, LucideIcon>)[key]
    : undefined;
  return Component ? (
    <Component size={size} aria-hidden="true" />
  ) : (
    <span className="gpt-rich-unknown-icon" title={name}>
      ?
    </span>
  );
}
