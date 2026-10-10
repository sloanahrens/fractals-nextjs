// React's types describe HTML and SVG elements but not MathML, which every
// current browser renders natively. These are the elements `MathView.tsx` uses,
// and no more; a new one is added here when a component starts needing it.

import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MathMLProps<Extra = object> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Extra;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps<{ display?: "inline" | "block" }>;
      mrow: MathMLProps;
      mn: MathMLProps;
      mi: MathMLProps;
      mo: MathMLProps;
      mtext: MathMLProps;
      msup: MathMLProps;
      msub: MathMLProps;
      mfrac: MathMLProps;
      mover: MathMLProps<{ accent?: "true" | "false" }>;
    }
  }
}
