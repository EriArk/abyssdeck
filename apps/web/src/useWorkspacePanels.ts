import { type RefObject, useLayoutEffect, useRef } from "react";

/** Animate deliberate panel toggles only; resizing and viewport/keyboard changes stay immediate. */
export function useWorkspacePanels(
  ref: RefObject<HTMLDivElement | null>,
  navigationHidden: boolean,
  resultsHidden: boolean,
  active = true,
) {
  const previous = useRef({ navigationHidden, resultsHidden });
  const columns = useRef("");
  const resultWidth = useRef("0px");
  const dividerWidth = useRef("0px");
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !active) return;
    const results = root.querySelector<HTMLElement>(":scope > .workspace-content > .support-pane");
    const divider = root.querySelector<HTMLElement>(":scope > .workspace-content > .pane-divider");
    const remember = () => {
      columns.current = getComputedStyle(root).gridTemplateColumns;
      if (results) resultWidth.current = getComputedStyle(results).width;
      if (divider) dividerWidth.current = getComputedStyle(divider).width;
    };
    remember();
    const observer = new ResizeObserver(remember);
    observer.observe(root);
    const nav = root.querySelector(":scope > .desktop-nav");
    if (nav) observer.observe(nav);
    if (results) observer.observe(results);
    return () => observer.disconnect();
  }, [ref, active]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !active) return;
    const wide = matchMedia("(min-width: 1100px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const nav = root.querySelector<HTMLElement>(":scope > .desktop-nav");
    const results = root.querySelector<HTMLElement>(":scope > .workspace-content > .support-pane");
    const animations: Animation[] = [];
    const cancel = () => {
      for (const a of animations) a.cancel();
      delete root.dataset.panelsMoving;
    };
    const resizeStart = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".pane-divider")) cancel();
    };
    const sync = () => {
      if (nav) nav.inert = wide.matches && navigationHidden;
      if (results) results.inert = wide.matches && resultsHidden;
      if (!wide.matches || reduced.matches) cancel();
    };
    const navigationChanged = previous.current.navigationHidden !== navigationHidden;
    const changed =
      previous.current.navigationHidden !== navigationHidden ||
      previous.current.resultsHidden !== resultsHidden;
    const previousResultsHidden = previous.current.resultsHidden;
    previous.current = { navigationHidden, resultsHidden };
    if (changed && wide.matches && !reduced.matches) root.dataset.panelsMoving = "true";
    // Resolve clamp()/0 tracks to pixels: browsers otherwise switch these grid tracks discretely.
    if (changed && wide.matches && !reduced.matches) {
      const timing = { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" };
      if (navigationChanged && columns.current)
        animations.push(
          root.animate(
            [
              { gridTemplateColumns: columns.current },
              { gridTemplateColumns: getComputedStyle(root).gridTemplateColumns },
            ],
            timing,
          ),
        );
      if (previousResultsHidden !== resultsHidden && results) {
        const width = getComputedStyle(results).width;
        animations.push(
          results.animate(
            [
              { width: resultWidth.current, minWidth: "0px" },
              { width, minWidth: "0px" },
            ],
            timing,
          ),
        );
        const divider = root.querySelector<HTMLElement>(
          ":scope > .workspace-content > .pane-divider",
        );
        if (divider)
          animations.push(
            divider.animate(
              [
                { width: dividerWidth.current, minWidth: dividerWidth.current },
                {
                  width: getComputedStyle(divider).width,
                  minWidth: getComputedStyle(divider).width,
                },
              ],
              timing,
            ),
          );
      }
    }
    sync();
    const timer = window.setTimeout(() => delete root.dataset.panelsMoving, 260);
    root.addEventListener("pointerdown", resizeStart);
    root.addEventListener("keydown", resizeStart);
    window.addEventListener("resize", cancel);
    wide.addEventListener("change", sync);
    reduced.addEventListener("change", sync);
    return () => {
      for (const animation of animations) animation.cancel();
      root.removeEventListener("pointerdown", resizeStart);
      root.removeEventListener("keydown", resizeStart);
      window.removeEventListener("resize", cancel);
      clearTimeout(timer);
      wide.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [ref, navigationHidden, resultsHidden, active]);
}
