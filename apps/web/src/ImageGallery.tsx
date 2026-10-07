import { Children, type ReactNode, useState } from "react";
import { Icon } from "./icons";
import "./image-gallery.css";

export function GalleryNavigation({
  index,
  count,
  previous,
  next,
  images = true,
}: {
  index: number;
  count: number;
  previous?: () => void;
  next?: () => void;
  images?: boolean;
}) {
  return (
    <nav
      className="image-gallery-navigation"
      aria-label={images ? "Изображения" : "Загруженные файлы"}
    >
      <button
        type="button"
        className="icon-button"
        aria-label={images ? "Предыдущее изображение" : "Предыдущий файл"}
        disabled={!previous}
        onClick={previous}
      >
        <Icon name="back" />
      </button>
      <span aria-live="polite" aria-atomic="true">
        {index + 1} из {count}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={images ? "Следующее изображение" : "Следующий файл"}
        disabled={!next}
        onClick={next}
      >
        <Icon name="chevron" />
      </button>
    </nav>
  );
}

/** Keep the active slide mounted through streaming updates; unselected images are not fetched. */
export function ImageGallery({ children }: { children: ReactNode }) {
  const slides = Children.toArray(children);
  const [selected, setSelected] = useState<string | number | null>(null);
  const identity = (slide: ReactNode, index: number) =>
    typeof slide === "object" && slide && "key" in slide ? slide.key : index;
  const found = slides.findIndex((s, i) => identity(s, i) === selected);
  const index = found < 0 ? 0 : found;
  if (slides.length < 2) return <>{children}</>;
  const show = (next: number) => setSelected(identity(slides[next], next));
  return (
    // biome-ignore lint/a11y/useSemanticElements: This named image carousel is a group, not a form fieldset.
    <div className="image-gallery" role="group" aria-label="Галерея изображений">
      <div className="image-gallery-slide">{slides[index]}</div>
      <GalleryNavigation
        index={index}
        count={slides.length}
        previous={index > 0 ? () => show(index - 1) : undefined}
        next={index + 1 < slides.length ? () => show(index + 1) : undefined}
      />
    </div>
  );
}

// Rehype transform: group only adjacent image-only blocks. Text, captions, links,
// code and separate messages retain their original position and semantics.
type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};
const whitespace = (node: Node) => node.type === "text" && !node.value?.trim();
function images(node: Node): Node[] | null {
  if (node.type !== "element") return null;
  if (node.tagName === "img") return [node];
  if (node.tagName !== "p" || !node.children?.length) return null;
  const children = node.children.filter((c) => !whitespace(c));
  return children.length && children.every((c) => c.type === "element" && c.tagName === "img")
    ? children
    : null;
}
export function rehypeImageGallery() {
  return (tree: Node) => {
    const visit = (node: Node) => {
      if (!node.children || ["pre", "code", "a", "p"].includes(node.tagName ?? "")) return;
      const output: Node[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const first = node.children[i]!;
        const group = images(first);
        if (!group) {
          visit(first);
          output.push(first);
          continue;
        }
        let end = i;
        for (let next = i + 1; next < node.children.length; next++) {
          const candidate = node.children[next]!;
          if (whitespace(candidate)) continue;
          const more = images(candidate);
          if (!more) break;
          group.push(...more);
          end = next;
        }
        if (group.length > 1) {
          output.push({
            type: "element",
            tagName: "div",
            properties: { dataImageGallery: true },
            children: group,
          });
          i = end;
        } else output.push(first);
      }
      node.children = output;
    };
    visit(tree);
  };
}
