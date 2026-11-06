import { type ComponentProps, Suspense, lazy } from "react";
import type { SvgStack as SvgStackType } from "./SvgStack";

const SvgStackInner = lazy(() =>
  import("./SvgStack").then((m) => ({ default: m.SvgStack })),
);

type Props = ComponentProps<typeof SvgStackType>;

export function SvgStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <SvgStackInner {...props} />
    </Suspense>
  );
}
