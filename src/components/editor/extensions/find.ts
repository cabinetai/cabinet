import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// Local find-in-page (Cmd+F). This is deliberately separate from the global
// search palette (Cmd+K): the palette navigates *between* pages, this finds
// and highlights a word *within* the page that's already open.

export interface FindMatch {
  from: number;
  to: number;
}

interface FindPluginState {
  term: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** Index into `matches` for the active (strongly highlighted) hit; -1 = none. */
  current: number;
  decorations: DecorationSet;
}

interface FindMeta {
  term?: string;
  caseSensitive?: boolean;
  current?: number;
}

export const findPluginKey = new PluginKey<FindPluginState>("cabinetFind");

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches are found per text node. A term split across marks (e.g. a bold
// letter mid-word) lands in separate text nodes and won't match — the same
// limitation most editor find implementations accept for v1.
function computeMatches(
  doc: PMNode,
  term: string,
  caseSensitive: boolean
): FindMatch[] {
  const matches: FindMatch[] = [];
  if (!term) return matches;

  let re: RegExp;
  try {
    re = new RegExp(escapeRegExp(term), caseSensitive ? "g" : "gi");
  } catch {
    return matches;
  }

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const from = pos + m.index;
      matches.push({ from, to: from + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length
    }
  });

  return matches;
}

function recompute(
  doc: PMNode,
  term: string,
  caseSensitive: boolean,
  desiredCurrent: number
): Pick<FindPluginState, "matches" | "current" | "decorations"> {
  const matches = computeMatches(doc, term, caseSensitive);

  let current = desiredCurrent;
  if (matches.length === 0) current = -1;
  else if (current < 0 || current >= matches.length) current = 0;

  if (matches.length === 0) {
    return { matches, current, decorations: DecorationSet.empty };
  }

  const decorations = DecorationSet.create(
    doc,
    matches.map((match, i) =>
      Decoration.inline(match.from, match.to, {
        class:
          i === current ? "find-match find-match--current" : "find-match",
      })
    )
  );

  return { matches, current, decorations };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    cabinetFind: {
      /** Set the search term and jump to the match nearest the cursor. */
      setFindTerm: (term: string) => ReturnType;
      setFindCaseSensitive: (value: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      /** Clear the term and remove all match highlights. */
      clearFind: () => ReturnType;
    };
  }
}

export const FindExtension = Extension.create({
  name: "cabinetFind",

  addCommands() {
    return {
      setFindTerm:
        (term: string) =>
        ({ state, dispatch }) => {
          const ps = findPluginKey.getState(state);
          const caseSensitive = ps?.caseSensitive ?? false;
          const matches = computeMatches(state.doc, term, caseSensitive);
          // Start at the first match at/after the cursor so Enter walks
          // forward from where the user is, not from the top of the doc.
          const anchor = state.selection.from;
          let current = matches.findIndex((m) => m.from >= anchor);
          if (current === -1) current = matches.length > 0 ? 0 : -1;
          if (dispatch) {
            dispatch(state.tr.setMeta(findPluginKey, { term, current }));
          }
          return true;
        },

      setFindCaseSensitive:
        (value: boolean) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(
              state.tr.setMeta(findPluginKey, { caseSensitive: value })
            );
          }
          return true;
        },

      findNext:
        () =>
        ({ state, dispatch }) => {
          const ps = findPluginKey.getState(state);
          if (!ps || ps.matches.length === 0) return false;
          const next = (ps.current + 1) % ps.matches.length;
          if (dispatch) {
            dispatch(state.tr.setMeta(findPluginKey, { current: next }));
          }
          return true;
        },

      findPrev:
        () =>
        ({ state, dispatch }) => {
          const ps = findPluginKey.getState(state);
          if (!ps || ps.matches.length === 0) return false;
          const prev =
            (ps.current - 1 + ps.matches.length) % ps.matches.length;
          if (dispatch) {
            dispatch(state.tr.setMeta(findPluginKey, { current: prev }));
          }
          return true;
        },

      clearFind:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            dispatch(
              state.tr.setMeta(findPluginKey, { term: "", current: -1 })
            );
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindPluginState>({
        key: findPluginKey,
        state: {
          init() {
            return {
              term: "",
              caseSensitive: false,
              matches: [],
              current: -1,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(findPluginKey) as FindMeta | undefined;
            if (meta) {
              const term = meta.term !== undefined ? meta.term : value.term;
              const caseSensitive =
                meta.caseSensitive !== undefined
                  ? meta.caseSensitive
                  : value.caseSensitive;
              const desired =
                meta.current !== undefined ? meta.current : value.current;
              return {
                term,
                caseSensitive,
                ...recompute(newState.doc, term, caseSensitive, desired),
              };
            }
            // Keep highlights aligned while the user edits with the bar open.
            if (tr.docChanged && value.term) {
              return {
                term: value.term,
                caseSensitive: value.caseSensitive,
                ...recompute(
                  newState.doc,
                  value.term,
                  value.caseSensitive,
                  value.current
                ),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return (
              findPluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
        view() {
          return {
            update(view, prevState) {
              const cur = findPluginKey.getState(view.state);
              const old = findPluginKey.getState(prevState);
              if (!cur || cur.current < 0) return;
              const sameMatch =
                old &&
                old.current === cur.current &&
                old.term === cur.term &&
                old.matches.length === cur.matches.length;
              if (sameMatch) return;

              const match = cur.matches[cur.current];
              if (!match) return;
              const at = view.domAtPos(match.from);
              let el: Node | null = at.node;
              if (el && el.nodeType === Node.TEXT_NODE) {
                el = el.parentElement;
              }
              if (el && el instanceof HTMLElement) {
                el.scrollIntoView({ block: "center", inline: "nearest" });
              }
            },
          };
        },
      }),
    ];
  },
});
