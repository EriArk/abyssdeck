import { useRef } from "react";
import { useColumnDrag } from "./PanelDivider";

/** Percentages are relative to the content area, excluding project navigation. */
export function PaneDivider({
  value,
  onChange,
  navigation = false,
}: {
  value: number;
  onChange: (value: number) => void;
  navigation?: boolean;
}) {
  const element = useRef<HTMLHRElement>(null);
  const min = navigation ? 260 : 28,
    max = navigation ? 420 : 55,
    step = navigation ? 16 : 2;
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  const gesture = useColumnDrag(
    (pixels, start) => {
      const width = element.current?.parentElement?.clientWidth;
      if (width) onChange(clamp(start + (navigation ? pixels : (-100 * pixels) / width)));
    },
    () => {
      const node = element.current;
      const width = node?.parentElement?.clientWidth;
      const pane = (
        navigation ? node?.parentElement : node?.nextElementSibling
      )?.getBoundingClientRect();
      return width && pane ? (navigation ? pane.width : (100 * pane.width) / width) : value;
    },
  );
  return (
    <hr
      ref={element}
      {...gesture}
      className={`pane-divider${navigation ? " navigation-divider" : ""}`}
      aria-label={navigation ? "Ширина левой панели" : "Ширина результатов"}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(event) => {
        const values: Record<string, number> = {
          ArrowLeft: value + (navigation ? -step : step),
          ArrowRight: value + (navigation ? step : -step),
          Home: min,
          End: max,
        };
        const next = values[event.key];
        if (next !== undefined) {
          event.preventDefault();
          onChange(clamp(next));
        }
      }}
    />
  );
}
