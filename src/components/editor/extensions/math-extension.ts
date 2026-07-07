import { MathExtension } from "@aarkue/tiptap-math-extension";

export const CabinetMath = MathExtension.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from, empty } = selection;
        if (!empty) return false;

        // Get the text inside the current paragraph node up to the cursor position
        const textBefore = $from.parent.textBetween(0, $from.parentOffset);

        if (textBefore.endsWith("$$")) {
          // Check for block math
          const match = textBefore.match(/\$\$(?!\s)(.*?(?<!\\))\$\$$/);
          if (match) {
            const latex = match[1];
            const startPos = $from.start() + match.index!;
            const endPos = $from.pos;
            this.editor.chain()
              .insertContentAt({ from: startPos, to: endPos }, {
                type: "inlineMath",
                attrs: { latex, evaluate: "no", display: "yes" }
              })
              .run();
          }
        } else if (textBefore.endsWith("$")) {
          // Check for inline math (support single or legacy double dollar start)
          const match = textBefore.match(/(?<!\$)\${1,2}(?![$\s,.])((?:[^$\\]|\\\$|\\)+?(?<![\\\s(["]))\$$/);
          if (match) {
            const latex = match[1];
            const startPos = $from.start() + match.index!;
            const endPos = $from.pos;
            this.editor.chain()
              .insertContentAt({ from: startPos, to: endPos }, {
                type: "inlineMath",
                attrs: { latex, evaluate: "no", display: "no" }
              })
              .run();
          }
        }

        return false; // let the default Enter behavior split the line
      }
    };
  }
}).configure({
  evaluation: false,
  addInlineMath: true,
  delimiters: "dollar",
  renderTextMode: "raw-latex",
});
