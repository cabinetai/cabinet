import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Move the top-level block containing the current selection up or down
 * by one sibling. Returns true if the doc was mutated. Used for keyboard
 * reorder (Alt+Shift+Up/Down) so non-mouse users get parity with the
 * drag handle (audit #102).
 */
function moveCurrentBlock(
  state: EditorView["state"],
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: "up" | "down"
): boolean {
  const { selection, doc } = state;
  // Resolve the top-level block that holds the current selection. We walk
  // up to depth 1 because doc → top-level-block → … is the layout we care
  // about; nested list items still move as siblings of their parent block.
  let $pos = doc.resolve(selection.from);
  while ($pos.depth > 1) {
    $pos = doc.resolve($pos.before($pos.depth));
  }
  if ($pos.depth === 0) return false;

  const blockPos = $pos.before(1);
  const block = doc.nodeAt(blockPos);
  if (!block) return false;

  const parent = doc;
  const indexInParent = $pos.index(0);
  const siblingIndex = direction === "up" ? indexInParent - 1 : indexInParent + 1;
  if (siblingIndex < 0 || siblingIndex >= parent.childCount) return false;

  const sibling = parent.child(siblingIndex);
  let tr = state.tr;

  // Remove the block, then re-insert it on the other side of the sibling.
  // Computing the insertion target *before* the cut keeps positions stable.
  const blockEnd = blockPos + block.nodeSize;
  const siblingStart = direction === "up" ? blockPos - sibling.nodeSize : blockEnd;
  const siblingEnd = direction === "up" ? blockPos : blockEnd + sibling.nodeSize;

  if (direction === "up") {
    tr = tr.delete(blockPos, blockEnd);
    tr = tr.insert(siblingStart, block);
    // After re-insert the block lives at siblingStart; restore selection on it.
    tr = tr.setSelection(NodeSelection.create(tr.doc, siblingStart));
  } else {
    tr = tr.delete(blockPos, blockEnd);
    // After deletion the sibling shifts left by block.nodeSize, so the
    // insertion target is siblingEnd - block.nodeSize.
    const insertAt = siblingEnd - block.nodeSize;
    tr = tr.insert(insertAt, block);
    tr = tr.setSelection(NodeSelection.create(tr.doc, insertAt));
  }

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

const HANDLE_ID = "cabinet-drag-handle";
const ADD_BTN_ID = "cabinet-gutter-add";

function getOrCreateAddButton(): HTMLButtonElement {
  let el = document.getElementById(ADD_BTN_ID) as HTMLButtonElement | null;
  if (!el) {
    el = document.createElement("button");
    el.id = ADD_BTN_ID;
    el.type = "button";
    el.setAttribute("aria-label", "Add block");
    el.title = "Add block";
    el.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 1V9M1 5H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    Object.assign(el.style, {
      position: "absolute",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      cursor: "pointer",
      borderRadius: "4px",
      color: "var(--muted-foreground)",
      opacity: "0.55",
      zIndex: "40",
      transition: "opacity 120ms ease, background 120ms ease",
      background: "transparent",
      border: "none",
      padding: "0",
    } as Partial<CSSStyleDeclaration>);
    el.addEventListener("mouseenter", () => {
      el!.style.opacity = "1";
      el!.style.background = "var(--muted)";
    });
    el.addEventListener("mouseleave", () => {
      el!.style.opacity = "0.55";
      el!.style.background = "transparent";
    });
    document.body.appendChild(el);
  }
  return el;
}

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/** Vertical-hit test against a node's rendered box. */
function domContainsY(view: EditorView, pos: number, top: number): boolean {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return false;
  const r = dom.getBoundingClientRect();
  return top >= r.top && top <= r.bottom;
}

/** Find the direct child of `listNode` whose rendered box contains `top`. */
function childItemAtY(
  view: EditorView,
  listPos: number,
  listNode: PMNode,
  top: number
): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null;
  listNode.forEach((child, offset) => {
    if (found) return;
    const childPos = listPos + 1 + offset; // +1 enters the list node
    if (domContainsY(view, childPos, top)) found = { pos: childPos, node: child };
  });
  return found;
}

/** Within a list item, find a nested sub-list whose box contains `top`. */
function nestedListAtY(
  view: EditorView,
  itemPos: number,
  itemNode: PMNode,
  top: number
): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null;
  itemNode.forEach((child, offset) => {
    if (found) return;
    if (!LIST_TYPES.has(child.type.name)) return;
    const childPos = itemPos + 1 + offset;
    if (domContainsY(view, childPos, top)) found = { pos: childPos, node: child };
  });
  return found;
}

function findBlockAt(view: EditorView, coords: { left: number; top: number }) {
  const pos = view.posAtCoords(coords);
  if (!pos) return null;
  let $pos = view.state.doc.resolve(pos.inside >= 0 ? pos.inside : pos.pos);
  while ($pos.depth > 0 && !$pos.parent.type.isBlock) {
    $pos = view.state.doc.resolve($pos.before());
  }

  // Step 1: resolve the top-level block (child of doc) under the cursor.
  let nodePos: number;
  if ($pos.depth === 0) {
    // posAtCoords landed on a boundary between top-level blocks (inside:-1).
    // This happens when the pointer is in a block's margin or past the end of
    // short text — e.g. hovering a heading whose text doesn't reach the probe
    // X. Picking nodePos 0 here was the bug (it always returned the first
    // node). Instead choose the adjacent top-level child whose rendered box
    // vertically contains coords.top, preferring the node after the boundary.
    const afterPos = $pos.pos;
    const beforePos = $pos.nodeBefore ? $pos.pos - $pos.nodeBefore.nodeSize : -1;
    if ($pos.nodeAfter && domContainsY(view, afterPos, coords.top)) nodePos = afterPos;
    else if ($pos.nodeBefore && domContainsY(view, beforePos, coords.top)) nodePos = beforePos;
    else if ($pos.nodeAfter) nodePos = afterPos;
    else if (beforePos >= 0) nodePos = beforePos;
    else return null;
  } else {
    // Walk up until we find a top-level child of the doc
    let depth = $pos.depth;
    while (depth > 1) {
      const parent = view.state.doc.resolve($pos.before(depth)).parent;
      if (parent.type.name === "doc") break;
      depth -= 1;
    }
    nodePos = $pos.before(Math.max(depth, 1));
  }

  let node = view.state.doc.nodeAt(nodePos);
  if (!node) return null;

  // Step 2: if the block is a list, descend to the individual list item under
  // the cursor's Y (Notion-style per-item handles), recursing into nested
  // sub-lists so the handle targets the deepest item the pointer is over.
  while (node && LIST_TYPES.has(node.type.name)) {
    const item = childItemAtY(view, nodePos, node, coords.top);
    if (!item) break;
    const nested = nestedListAtY(view, item.pos, item.node, coords.top);
    if (nested) {
      // Cursor is over the nested portion → descend into the sub-list.
      nodePos = nested.pos;
      node = nested.node as typeof node;
      continue;
    }
    // Cursor is on this item's own line → target the item itself.
    nodePos = item.pos;
    node = item.node as typeof node;
    break;
  }

  const dom = view.nodeDOM(nodePos) as HTMLElement | null;
  return { pos: nodePos, node, dom };
}

function getOrCreateHandle(): HTMLDivElement {
  let el = document.getElementById(HANDLE_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = HANDLE_ID;
    el.setAttribute("data-drag-handle", "true");
    el.draggable = true;
    el.innerHTML = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="2.5" cy="3" r="1.2"/><circle cx="2.5" cy="8" r="1.2"/><circle cx="2.5" cy="13" r="1.2"/><circle cx="7.5" cy="3" r="1.2"/><circle cx="7.5" cy="8" r="1.2"/><circle cx="7.5" cy="13" r="1.2"/></svg>`;
    Object.assign(el.style, {
      position: "absolute",
      display: "none",
      cursor: "grab",
      padding: "2px 4px",
      borderRadius: "4px",
      color: "var(--muted-foreground)",
      opacity: "0.55",
      zIndex: "40",
      userSelect: "none",
      transition: "opacity 120ms ease",
    } as CSSStyleDeclaration);
    el.addEventListener("mouseenter", () => (el!.style.opacity = "1"));
    el.addEventListener("mouseleave", () => (el!.style.opacity = "0.55"));
    document.body.appendChild(el);
  }
  return el;
}

export const DragHandle = Extension.create({
  name: "dragHandle",

  addKeyboardShortcuts() {
    // Audit #102: drag handle is mouse-only. Add Alt+Shift+ArrowUp /
    // Alt+Shift+ArrowDown so keyboard users can reorder blocks too.
    return {
      "Mod-Alt-ArrowUp": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "up"),
      "Mod-Alt-ArrowDown": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "down"),
      "Alt-Shift-ArrowUp": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "up"),
      "Alt-Shift-ArrowDown": ({ editor }) =>
        moveCurrentBlock(editor.state, editor.view.dispatch, "down"),
    };
  },

  addProseMirrorPlugins() {
    let currentBlock: { pos: number; node: PMNode; dom: HTMLElement } | null = null;

    const handle = typeof document !== "undefined" ? getOrCreateHandle() : null;
    const addBtn = typeof document !== "undefined" ? getOrCreateAddButton() : null;

    const hide = () => {
      if (handle) handle.style.display = "none";
      if (addBtn) addBtn.style.display = "none";
      currentBlock = null;
    };

    return [
      new Plugin({
        key: new PluginKey("cabinetDragHandle"),
        view: (view) => {
          if (!handle) return { destroy: () => {} };

          const onMouseMove = (event: MouseEvent) => {
            if (!view.editable) return;
            // Ignore stale/duplicate editor views (e.g. React StrictMode or a
            // detached instance left over from a remount). Their view.dom is
            // disconnected and reports a zero rect, which would otherwise call
            // hide() on every mousemove and fight the live instance → flicker.
            if (!view.dom.isConnected) return;
            const rect = view.dom.getBoundingClientRect();
            if (
              event.clientX < rect.left - 60 ||
              event.clientX > rect.right + 60 ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            ) {
              hide();
              return;
            }
            // Probe inside the editor with clientX clamped to content
            const probeX = Math.max(rect.left + 20, Math.min(rect.right - 20, event.clientX));
            const block = findBlockAt(view, { left: probeX, top: event.clientY });
            if (!block || !block.dom || !(block.dom instanceof HTMLElement)) {
              hide();
              return;
            }
            currentBlock = block as typeof currentBlock;
            const domRect = block.dom.getBoundingClientRect();
            // For list items the block DOM is the <li>, whose box starts at the
            // text (the bullet/number marker is drawn just outside it). Anchoring
            // to the <li> left would place the handle on top of the marker, so
            // use the parent list element's edge instead — that sits left of the
            // markers and lines up with paragraph handles (and indents naturally
            // for nested sub-lists).
            const blockType = (block.node as { type?: { name?: string } }).type?.name;
            const isListItem = blockType === "listItem" || blockType === "taskItem";
            const anchorEl =
              isListItem && block.dom.parentElement instanceof HTMLElement
                ? block.dom.parentElement
                : block.dom;
            const anchorRect = anchorEl.getBoundingClientRect();
            const leftEdge = anchorRect.left;
            const rightEdge = anchorRect.right;
            const isRtl =
              typeof document !== "undefined" &&
              document.documentElement.dir === "rtl";
            handle.style.display = "flex";
            handle.style.top = `${window.scrollY + domRect.top + 4}px`;
            if (isRtl) {
              // Anchor the gutter from the block's right edge so the drag /
              // add handles sit outside the content's logical start in RTL.
              handle.style.left = "auto";
              handle.style.right = `${
                document.documentElement.clientWidth -
                (window.scrollX + rightEdge) -
                22
              }px`;
            } else {
              handle.style.right = "auto";
              handle.style.left = `${window.scrollX + leftEdge - 22}px`;
            }
            if (addBtn) {
              addBtn.style.display = "flex";
              addBtn.style.top = `${window.scrollY + domRect.top + 4}px`;
              if (isRtl) {
                addBtn.style.left = "auto";
                addBtn.style.right = `${
                  document.documentElement.clientWidth -
                  (window.scrollX + rightEdge) -
                  44
                }px`;
              } else {
                addBtn.style.right = "auto";
                addBtn.style.left = `${window.scrollX + leftEdge - 44}px`;
              }
            }
          };

          const onAddClick = () => {
            if (!currentBlock) return;
            // Insert a new empty block after the current one, then open the slash
            // menu. We insert an explicit node (rather than tr.split) because
            // splitting a list item at the default depth produces an invalid
            // empty listItem. The inserted node matches the context: a sibling
            // list item inside lists, a paragraph otherwise.
            const { schema } = view.state;
            const paragraph = schema.nodes.paragraph;
            if (!paragraph) return;
            const afterPos = currentBlock.pos + currentBlock.node.nodeSize;
            const blockType = currentBlock.node.type;
            const isListItem =
              blockType.name === "listItem" || blockType.name === "taskItem";

            let tr = view.state.tr;
            let cursorPos: number;
            if (isListItem) {
              // Sibling list item containing one empty paragraph. +2 to land the
              // cursor inside the new item's paragraph (enter item, enter para).
              const attrs = blockType.name === "taskItem" ? { checked: false } : null;
              const newItem = blockType.create(attrs, paragraph.create());
              tr = tr.insert(afterPos, newItem);
              cursorPos = afterPos + 2;
            } else {
              tr = tr.insert(afterPos, paragraph.create());
              cursorPos = afterPos + 1;
            }
            const sel = TextSelection.create(tr.doc, Math.min(cursorPos, tr.doc.content.size));
            tr = tr.setSelection(sel).scrollIntoView();
            view.dispatch(tr);
            view.focus();
            // Dispatch on view.dom so event.target is the ProseMirror element;
            // this lets the global "/" hotkey guard (isEditableTarget) skip it
            // while the slash-commands capture listener on window still fires.
            view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
          };

          const onDragStart = (event: DragEvent) => {
            if (!currentBlock || !event.dataTransfer) return;
            const { pos, dom } = currentBlock;

            // Select the block so PM treats it as the drag source
            const tr = view.state.tr.setSelection(
              NodeSelection.create(view.state.doc, pos)
            );
            view.dispatch(tr);

            const slice = view.state.selection.content();
            // Serialize slice content to HTML for external drop targets
            const tmp = document.createElement("div");
            tmp.appendChild(
              view.someProp("clipboardSerializer")?.serializeFragment(slice.content) ??
                document.createElement("div")
            );
            event.dataTransfer.clearData();
            event.dataTransfer.setData("text/html", tmp.innerHTML);
            event.dataTransfer.setData("text/plain", dom.textContent ?? "");
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setDragImage(dom, 0, 0);

            // Hand PM the slice so its built-in drop handler performs the move
            view.dragging = { slice, move: true };
          };

          window.addEventListener("mousemove", onMouseMove);
          handle.addEventListener("dragstart", onDragStart);
          if (addBtn) addBtn.addEventListener("click", onAddClick);

          return {
            destroy() {
              window.removeEventListener("mousemove", onMouseMove);
              handle.removeEventListener("dragstart", onDragStart);
              if (addBtn) addBtn.removeEventListener("click", onAddClick);
              hide();
            },
          };
        },
      }),
    ];
  },
});
