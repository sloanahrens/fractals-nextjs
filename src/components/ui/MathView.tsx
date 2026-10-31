import React from "react";

import { type MathExpr, toPlainText } from "../../lib/fractalMath";

interface MathViewProps {
  /** The formula to typeset. */
  expr: MathExpr;
  className?: string;
}

/** The bar drawn over a conjugated term: U+00AF, which every math font has. */
const OVERBAR = "¯";

/** One node of the tree as MathML, keyed by its place among its siblings. */
function node(expr: MathExpr, key: number): React.ReactNode {
  switch (expr.kind) {
    case "number":
      return <mn key={key}>{expr.value}</mn>;
    case "identifier":
      return <mi key={key}>{expr.name}</mi>;
    case "operator":
      return <mo key={key}>{expr.symbol}</mo>;
    case "text":
      return <mtext key={key}>{expr.value}</mtext>;
    case "row":
      return <mrow key={key}>{expr.items.map(node)}</mrow>;
    case "superscript":
      return (
        <msup key={key}>
          {node(expr.base, 0)}
          {node(expr.exponent, 1)}
        </msup>
      );
    case "subscript":
      return (
        <msub key={key}>
          {node(expr.base, 0)}
          {node(expr.subscript, 1)}
        </msub>
      );
    case "fraction":
      return (
        <mfrac key={key}>
          <mrow>{node(expr.numerator, 0)}</mrow>
          <mrow>{node(expr.denominator, 0)}</mrow>
        </mfrac>
      );
    case "conjugate":
      return (
        <mover key={key} accent="true">
          {node(expr.of, 0)}
          <mo>{OVERBAR}</mo>
        </mover>
      );
    case "abs":
      return (
        <mrow key={key}>
          <mo>|</mo>
          {node(expr.of, 0)}
          <mo>|</mo>
        </mrow>
      );
    case "sqrt":
      return <msqrt key={key}>{node(expr.of, 0)}</msqrt>;
  }
}

/**
 * A formula as native MathML.
 *
 * The `<math>` family renders in Chrome, Safari and Firefox with no library
 * and no font to load, and React builds it in the MathML namespace on its own.
 * The element is an `img` with a plain-text label made from the same tree
 * (`toPlainText`), so a screen reader says "z becomes z squared plus c" rather
 * than spelling out the glyphs. Nothing here is a string of markup.
 */
export function MathView({ expr, className }: MathViewProps) {
  return (
    <math
      display="inline"
      role="img"
      aria-label={toPlainText(expr)}
      className={className}
    >
      {node(expr, 0)}
    </math>
  );
}
