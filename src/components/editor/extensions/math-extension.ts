import { MathExtension } from "@aarkue/tiptap-math-extension";

export const CabinetMath = MathExtension.configure({
  evaluation: false,
  addInlineMath: true,
  delimiters: "dollar",
  renderTextMode: "raw-latex",
});
