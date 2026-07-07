"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Editor, { loader } from "@monaco-editor/react";
import { useTheme } from "@/components/theme-provider";
import { useEditorSettings } from "@/hooks/use-editor-settings";

if (typeof window !== "undefined") {
  loader.config({ paths: { vs: "/monaco/vs" } });
}

import { Sparkles, Loader2, FilePlus, Lock } from "lucide-react";
import { editorExtensions } from "./extensions";
import { EditorToolbar } from "./editor-toolbar";
import { SlashCommands } from "./slash-commands";
import { EditorMentionPicker } from "./mention-picker";
import { PasteLinkMenu } from "./paste-link-menu";
import { EditorBubbleMenu } from "./bubble-menu";
import { TableMenu } from "./table-menu";
import { FindBar } from "./find-bar";
import { FolderIndex } from "./folder-index";
import { ContentSheet } from "@/components/layout/content-sheet";
import { FolderTabs } from "@/components/layout/folder-tabs";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { htmlToMarkdown } from "@/lib/markdown/to-markdown";
import { buildDocumentPropertiesHtml } from "./extensions/document-properties";
import {
  stringifyFrontmatter,
  parseFrontmatter,
} from "@/lib/markdown/frontmatter-text";
import { slugifyPageName } from "@/lib/markdown/wiki-links";
import { detectEmbed } from "@/lib/embeds/detect";
import { stripImportsAndWrappers } from "@/lib/mdx/live-code-strip";
import { openUrlInAppropriateContext } from "@/lib/runtime/open-url";
import { cellAround, isInTable } from "@tiptap/pm/tables";
import type { TreeNode, FrontMatter } from "@/types";
import { useLocale } from "@/i18n/use-locale";
import { useSplitResize } from "@/hooks/use-split-resize";
import { SplitRuler } from "./split-ruler";

async function uploadFile(pagePath: string, file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch(`/api/upload/${pagePath}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url;
  } catch {
    return null;
  }
}

/**
 * Heuristic: text looks like a React/JSX snippet copied from docs when it
 * contains `import` statements AND JSX angle-bracket tags. This avoids false
 * positives on plain HTML or regular code pastes.
 */
function looksLikeJsxWithImports(text: string): boolean {
  const hasImport = /^\s*import\s+/m.test(text);
  const hasJsxTag = /<[A-Z][A-Za-z0-9]*[\s/>]/.test(text);
  return hasImport && hasJsxTag;
}

const WIDE_MODE_KEY = "kb-editor-wide-mode";

function flattenTree(nodes: TreeNode[]): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  for (const node of nodes) {
    result.push({ path: node.path, name: node.name });
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

function findPageBySlug(slug: string, currentPath: string | null, nodes: TreeNode[]): string | null {
  const allPages = flattenTree(nodes);
  // The slug matches the last segment of the path. Native pages are stored with
  // slug filenames, so an exact match works; imported pages (e.g. Notion) keep
  // human names ("Day 1-100 Build 👩🏻‍💻"), so also match when the last segment
  // *slugifies to* the target slug. Kept behaviourally identical to
  // references.ts#resolvePageBySlug (the server-side rewrite mirror).
  const lastSeg = (p: string) => p.split("/").pop() ?? p;
  const parentOf = (p: string) => (p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : "");
  const matches = allPages.filter(
    (p) =>
      p.name === slug ||
      p.path === slug ||
      p.path.endsWith("/" + slug) ||
      slugifyPageName(lastSeg(p.path)) === slug
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].path;

  // Prefer sibling pages (same parent directory as current page)
  if (currentPath) {
    const parentDir = parentOf(currentPath);
    const sibling = matches.find((m) => parentOf(m.path) === parentDir);
    if (sibling) return sibling.path;
  }
  return matches[0].path;
}

function navigateToPage(
  targetPath: string,
  selectPage: (path: string) => void,
  expandPath: (path: string) => void
) {
  const parts = targetPath.split("/");
  for (let i = 1; i < parts.length; i++) {
    expandPath(parts.slice(0, i).join("/"));
  }
  selectPage(targetPath);
  useEditorStore.getState().loadPage(targetPath);
  // Scroll editor container to top
  setTimeout(() => {
    document.querySelector("[data-editor-scroll]")?.scrollTo(0, 0);
  }, 0);
}

function resolveInternalLink(
  href: string,
  currentPath: string | null,
  nodes: TreeNode[]
): string | null {
  const allPages = flattenTree(nodes);

  // Clean up the href: strip .md extension, leading ./ or /
  const linkPath = href
    .replace(/\.md$/, "")
    .replace(/^\.\//, "")
    .replace(/^\//, "");

  // 1. Try as absolute path (exact match in tree)
  const exactMatch = allPages.find((p) => p.path === linkPath);
  if (exactMatch) return exactMatch.path;

  // 2. Try relative to current page's directory
  if (currentPath) {
    const parentDir = currentPath.includes("/")
      ? currentPath.substring(0, currentPath.lastIndexOf("/"))
      : "";
    const relativePath = parentDir ? parentDir + "/" + linkPath : linkPath;
    const relMatch = allPages.find((p) => p.path === relativePath);
    if (relMatch) return relMatch.path;
  }

  // 3. Try matching by last segment (slug-style lookup)
  const slug = linkPath.includes("/") ? linkPath.split("/").pop()! : linkPath;
  return findPageBySlug(slug, currentPath, nodes);
}

export function KBEditor() {
  const { t } = useLocale();
  const { resolvedTheme } = useTheme();
  const settings = useEditorSettings();
  const { currentPath, assetBase, content, saveStatus, frontmatter, isLoading, loadStatus, createMissingPage } = useEditorStore();
  const nodes = useTreeStore((s) => s.nodes);
  // A page under a read-only Connect Knowledge mount is view-only — edits would
  // be rejected server-side (403), so disable editing up front. The tree-builder
  // propagates knowledgePolicy down from the mount node.
  const isReadOnlyMount =
    (currentPath ? findNodeByPath(nodes, currentPath) : null)?.knowledgePolicy ===
    "read-only";
  const isRtl = frontmatter?.dir === "rtl";
  const isLoadingRef = useRef(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [splitMode, setSplitMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("kb-editor-split-mode") === "true";
    }
    return false;
  });
  const [splitHtml, setSplitHtml] = useState("");
  const split = useSplitResize("kb-editor-split-ratio", isRtl);

  const toggleSplitMode = useCallback(() => {
    setSplitMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("kb-editor-split-mode", String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sourceMode || !splitMode || !currentPath) return;

    const debounce = setTimeout(async () => {
      const { body } = parseFrontmatter(sourceText);
      try {
        const html = await markdownToHtml(body, assetBase ?? currentPath ?? undefined);
        setSplitHtml(html);
      } catch (err) {
        console.error("[KBEditor] Split preview compile failed:", err);
      }
    }, 150);

    return () => clearTimeout(debounce);
  }, [sourceText, sourceMode, splitMode, assetBase, currentPath]);
  // Wide mode lifts the max-w-3xl cap on the rendered page so tables get the
  // full viewport width. Read from localStorage in an effect (not the
  // initializer) to avoid an SSR hydration mismatch — same pattern as the
  // sidebar width pref.
  const [wideMode, setWideMode] = useState(false);
  useEffect(() => {
    setWideMode(window.localStorage.getItem(WIDE_MODE_KEY) === "1");
  }, []);
  const toggleWideMode = useCallback(() => {
    setWideMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(WIDE_MODE_KEY, next ? "1" : "0");
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);



  // Reset the tab to "page" whenever the path changes — opening a new folder
  // shouldn't skip its index.md if the previous folder was on Files. Has to
  // be an effect (not state-during-render) because Tiptap's EditorContent
  // calls flushSync internally; setState during the parent render explodes
  // when EditorContent renders in the same pass.
  const [folderTab, setFolderTab] = useState<"page" | "files">("page");
  // Inline "Link vs Embed" chooser after a bare URL is pasted on its own line.
  const [pasteMenu, setPasteMenu] = useState<{
    url: string;
    from: number;
    to: number;
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    setFolderTab("page");
  }, [currentPath]);

  // Guards against a freshly-mounted (content: "") editor autosaving its empty
  // initial state over a real page. Stays false until the content effect has
  // populated this editor instance at least once. Critical when leaving browse
  // mode: that unmounts/remounts KBEditor while the store is already
  // loadStatus "ok", so the loadStatus guard below wouldn't catch the spurious
  // empty onUpdate the way it does on a cold app start.
  const hasPopulatedRef = useRef(false);

  const handleUpdate = useCallback(
    ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
      if (isLoadingRef.current || !editor) return;
      // Ignore updates until the page has loaded — a transaction fired while the
      // fetch is in flight (e.g. editor mount/normalization on a fresh
      // open) must not mark the page dirty with the empty loading state.
      if (useEditorStore.getState().loadStatus !== "ok") return;
      // Ignore updates before this editor instance has been populated once —
      // the initial empty-doc transaction must never overwrite stored content.
      if (!hasPopulatedRef.current) return;
      const html = editor.getHTML();
      const store = useEditorStore.getState();
      const md = htmlToMarkdown(html, store.currentPath, store.assetBase);

      // If content hasn't changed, do not trigger store updates or dirty flags
      if (md === store.content) return;

      // Block stray empty editor updates from overwriting non-empty store content when not focused
      if (md.trim() === "" && store.content.trim() !== "" && !editor.isFocused) {
        console.warn("[KBEditor] Blocked stray empty editor update from overwriting store content");
        return;
      }

      store.updateContent(md);
    },
    []
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: "",
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class:
          "focus:outline-none min-h-[calc(100vh-12rem)] px-4 sm:px-8 py-6 max-w-(--editor-max-w,48rem) mx-auto",
        dir: isRtl ? "rtl" : "ltr",
      },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && isInTable(view.state)) {
          const $cell = cellAround(view.state.selection.$from);
          const cell = $cell?.nodeAfter;
          if (!$cell || !cell) return false;

          const from = $cell.pos + 1;
          const to = $cell.pos + cell.nodeSize - 1;
          if (view.state.selection.from === from && view.state.selection.to === to) {
            return false;
          }

          event.preventDefault();
          editor?.chain().focus().setTextSelection({ from, to }).run();
          return true;
        }

        // Escape collapses a text selection, which dismisses the bubble menu.
        if (event.key === "Escape" && !view.state.selection.empty) {
          event.preventDefault();
          const { to } = view.state.selection;
          editor?.chain().focus().setTextSelection(to).run();
          return true;
        }

        return false;
      },
      handleClick: (_view, _pos, event) => {
          const target = event.target as HTMLElement;
          const link = target.closest("a") as HTMLAnchorElement | null;
          if (!link) return false;

          const href = link.getAttribute("href");
          if (!href) return false;

          // Wiki-links: #page:slug
          if (href.startsWith("#page:")) {
            event.preventDefault();
            event.stopPropagation();
            const slug = href.replace("#page:", "");
            const { nodes, selectPage, expandPath } = useTreeStore.getState();
            const activePath = useEditorStore.getState().currentPath;
            const targetPath = findPageBySlug(slug, activePath, nodes);
            if (targetPath) {
              navigateToPage(targetPath, selectPage, expandPath);
            }
            return true;
          }

          // Plain in-page section anchor: #heading (PRD §11). Routing lives on
          // the path now, so a bare hash is a scroll target, not a route.
          if (href.startsWith("#")) {
            event.preventDefault();
            event.stopPropagation();
            const id = decodeURIComponent(href.slice(1));
            const el = id ? document.getElementById(id) : null;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${href}`
              );
            }
            return true;
          }

          // Skip API asset links (PDFs, images); they load directly.
          if (href.startsWith("/api/")) return false;

          // External links: open in the built-in browser.
          if (/^https?:\/\//.test(href) || href.startsWith("//")) {
            event.preventDefault();
            event.stopPropagation();
            openUrlInAppropriateContext(href, (url) =>
              useAppStore.getState().setAppMode("browse", url)
            );
            return true;
          }
          if (href.startsWith("file://")) {
            event.preventDefault();
            event.stopPropagation();
            const pathPart = href.slice("file://".length);
            const encoded = pathPart.includes("%20") || !pathPart.includes(" ")
              ? href
              : "file://" + encodeURI(pathPart);
            openUrlInAppropriateContext(encoded, (url) =>
              useAppStore.getState().setAppMode("browse", url)
            );
            return true;
          }
          if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;

          event.preventDefault();
          event.stopPropagation();

          const { nodes, selectPage, expandPath } = useTreeStore.getState();
          const activePath = useEditorStore.getState().currentPath;

          // Resolve the link target to a KB page path
          const targetPath = resolveInternalLink(href, activePath, nodes);
          if (targetPath) {
            navigateToPage(targetPath, selectPage, expandPath);
          }
          return true;
        },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        const pagePath = useEditorStore.getState().currentPath;

        // 1. File paste → upload then insert appropriate node
        if (files && files.length > 0 && pagePath) {
          for (const file of Array.from(files)) {
            uploadFile(pagePath, file).then((url) => {
              if (!url || !editor) return;
              if (file.type.startsWith("image/")) {
                editor.chain().focus().setImage({ src: url, alt: file.name }).run();
              } else if (file.type.startsWith("video/")) {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "embed",
                    attrs: { provider: "video", src: url, originalUrl: url },
                  })
                  .run();
              } else {
                editor
                  .chain()
                  .focus()
                  .insertContent(`<a href="${url}">${file.name}</a>`)
                  .run();
              }
            });
          }
          return true;
        }

        // 2. URL paste — auto-embed known providers (YouTube, Vimeo, Loom, etc.)
        //    anywhere. Generic iframe/video fallbacks only auto-embed on an empty
        //    line so ordinary URLs in prose still become plain links.
        if (text && /^https?:\/\/\S+$/.test(text) && editor) {
          const detected = detectEmbed(text);
          if (detected) {
            const isGenericFallback =
              detected.provider === "iframe" || detected.provider === "video";
            const { $from, from } = editor.state.selection;
            const onEmptyLine = $from.parent.textContent.length === 0;

            // Generic web page on its own line: don't force an iframe (many sites
            // refuse framing -> dead grey box). Drop a plain link and let the user
            // pick Link vs Embed via the inline menu (Embed is frame-checked).
            if (detected.provider === "iframe" && onEmptyLine) {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "text",
                  text,
                  marks: [{ type: "link", attrs: { href: text } }],
                })
                .run();
              const to = editor.state.selection.from;
              const coords = editor.view.coordsAtPos(to);
              setPasteMenu({
                url: text,
                from,
                to,
                top: coords.bottom + 4,
                left: coords.left,
              });
              return true;
            }

            // Media providers embed anywhere; video files embed on their own line.
            if (!isGenericFallback || onEmptyLine) {
              editor.commands.setEmbed({ url: text });
              return true;
            }
          }
        }

        // 3. JSX paste — auto-convert code with JSX tags + imports to a live
        //    code block. This catches copy-pasted chart examples from docs.
        if (text && editor && looksLikeJsxWithImports(text)) {
          const stripped = stripImportsAndWrappers(text);
          if (stripped.trim()) {
            editor.commands.insertLiveCodeBlock({ code: stripped.trim() });
            return true;
          }
        }

        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const pagePath = useEditorStore.getState().currentPath;
        if (!pagePath) return false;

        event.preventDefault();
        for (const file of Array.from(files)) {
          uploadFile(pagePath, file).then((url) => {
            if (!url || !editor) return;
            if (file.type.startsWith("image/")) {
              editor.chain().focus().setImage({ src: url, alt: file.name }).run();
            } else if (file.type.startsWith("video/")) {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "embed",
                  attrs: { provider: "video", src: url, originalUrl: url },
                })
                .run();
            } else {
              editor
                .chain()
                .focus()
                .insertContent(`<a href="${url}">${file.name}</a>`)
                .run();
            }
          });
        }
        return true;
      },
    },
    immediatelyRender: false,
  });

  const handleSetMode = useCallback(async (targetMode: "edit" | "preview" | "split") => {
    if (targetMode === "preview") {
      if (sourceMode) {
        // Switching FROM source mode
        const { frontmatter: parsed, body } = parseFrontmatter(sourceText);
        const store = useEditorStore.getState();
        if (parsed) store.setFrontmatter(parsed as FrontMatter);
        store.updateContent(body);
        if (editor) {
          isLoadingRef.current = true;
          const html = await markdownToHtml(body, assetBase ?? currentPath ?? undefined);
          const fm = useEditorStore.getState().frontmatter;
          const propsHtml = fm ? buildDocumentPropertiesHtml(fm) : "";
          editor.commands.setContent(propsHtml + (html || "<p></p>"));
          setTimeout(() => { isLoadingRef.current = false; }, 50);
        }
        setSourceMode(false);
      }
      setSplitMode(false);
      try { window.localStorage.setItem("kb-editor-split-mode", "false"); } catch {}
    } else if (targetMode === "edit") {
      if (!sourceMode) {
        // Switching TO source mode
        const { frontmatter: fm, content: c } = useEditorStore.getState();
        setSourceText(stringifyFrontmatter(fm, c));
        setSourceMode(true);
      }
      setSplitMode(false);
      try { window.localStorage.setItem("kb-editor-split-mode", "false"); } catch {}
    } else if (targetMode === "split") {
      if (!sourceMode) {
        // Switching TO source mode
        const { frontmatter: fm, content: c } = useEditorStore.getState();
        setSourceText(stringifyFrontmatter(fm, c));
        setSourceMode(true);
      }
      setSplitMode(true);
      try { window.localStorage.setItem("kb-editor-split-mode", "true"); } catch {}
    }
  }, [sourceMode, sourceText, editor, assetBase, currentPath]);

  // Toggle editability when navigating into/out of a read-only mount.
  useEffect(() => {
    editor?.setEditable(!isReadOnlyMount);
  }, [editor, isReadOnlyMount]);

  // When content updates from store (after loadPage), set it in editor
  const prevPathRef = useRef<string | null>(null);
  // What the editor DOM currently shows, recorded when the async markdown
  // render completes. `key` dedupes identical (path, assetBase, content)
  // renders; `path` (which `key` embeds, so the two never disagree) drives
  // the loading overlay. One state object — set only in the async
  // completion — instead of a ref + separate renderedPath state, so the
  // effect never has to setState synchronously
  // (react-hooks/set-state-in-effect).
  const [rendered, setRendered] = useState<{ key: string; path: string } | null>(null);
  const renderedPath = rendered?.path ?? null;
  useEffect(() => {
    if (!editor || currentPath === null) return;
    // Skip if content hasn't actually changed (same path, dirty edit)
    if (useEditorStore.getState().isDirty && currentPath === prevPathRef.current) return;
    // During page navigation the store briefly holds content="" while the
    // fetch is in flight. Rendering that empty string into ProseMirror is
    // pure waste — every extension runs a full schema pass twice per
    // navigation. Skip until the real content arrives.
    if (isLoading && content === "") return;
    // Don't commit an empty render for a path whose fetch hasn't reported
    // success yet. If a cached paint or transient state lands content=""
    // before loadStatus flips to "ok" (isLoading already false), recording it
    // as the rendered key would hide the loading overlay over a blank page.
    if (content === "" && loadStatus !== "ok") return;
    // Dedupe identical (path, content) renders — e.g. cached paint followed
    // by a fresh fetch that returned the same markdown.
    // assetBase is in the key so a cached paint (assetBase null -> path
    // fallback) re-renders once the fetch reveals a standalone page's real
    // asset base.
    const key = `${currentPath}\u0000${assetBase ?? ""}\u0000${content}`;
    if (rendered?.key === key) return;
    prevPathRef.current = currentPath;

    const setContent = async () => {
      isLoadingRef.current = true;
      try {
        // assetBase (parent dir for standalone .md pages) resolves relative
        // image refs; currentPath is only correct for directory pages.
        const html = await markdownToHtml(content, assetBase ?? currentPath);
        // Prepend the Obsidian-style properties panel, built from the store's
        // parsed frontmatter, as a node at the very top of the document. The
        // body markdown itself never carries frontmatter (gray-matter split it
        // out on load; to-markdown strips this node back out on save).
        const fm = useEditorStore.getState().frontmatter;
        const propsHtml = fm ? buildDocumentPropertiesHtml(fm) : "";
        editor.commands.setContent(propsHtml + (html || "<p></p>"));
        // This editor instance now reflects stored content, so user-driven
        // onUpdate transactions are safe to persist (see hasPopulatedRef).
        hasPopulatedRef.current = true;
        setRendered({ key, path: currentPath });
        // Surface a known-bad state instead of silently rendering blank: the
        // store has content but ProseMirror parsed it down to nothing —
        // almost always a schema/extension mismatch (unknown element,
        // malformed table, …). Log so it's debuggable.
        if (content && editor.isEmpty) {
          console.warn(
            "[KBEditor] rendered empty document despite non-empty markdown",
            { path: currentPath, contentLength: content.length }
          );
        }
      } catch (err) {
        // Leave `rendered` unset (it's only set on success above) so the next
        // state tick retries instead of being blocked by a stale key.
        console.error("[KBEditor] failed to render markdown", err, {
          path: currentPath,
          contentLength: content.length,
        });
      } finally {
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 50);
      }
    };

    setContent();
  }, [editor, content, currentPath, assetBase, isLoading, loadStatus, rendered]);

  // Source mode snapshots the markdown when toggled on but doesn't follow
  // store updates — navigating to a new page with source mode open used to
  // leave the textarea showing the previous page. Re-sync whenever the store
  // content changes for this path and the user hasn't started editing.
  useEffect(() => {
    if (!sourceMode) return;
    if (useEditorStore.getState().isDirty) return;
    const next = stringifyFrontmatter(
      useEditorStore.getState().frontmatter,
      content
    );
    setSourceText((prev) => (prev === next ? prev : next));
  }, [sourceMode, content, currentPath]);

  // Section anchors (PRD §11): scroll to `#heading` on load and on hashchange.
  // Heading ids come from the HeadingAnchors decoration, applied after content
  // renders, so retry a few frames until the target exists.
  useEffect(() => {
    if (!editor) return;
    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (tries++ < 20) {
          requestAnimationFrame(tick);
        }
      };
      tick();
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, [editor, currentPath, rendered]);

  // Push frontmatter.dir into the ProseMirror contenteditable element so list
  // indentation, table cell alignment, and block direction all flip when the
  // user toggles RTL on the document. editorProps.attributes is read once at
  // editor creation, so we have to mutate the DOM imperatively here.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view?.dom;
    if (!el) return;
    el.setAttribute("dir", isRtl ? "rtl" : "ltr");
  }, [editor, isRtl]);

  const showLoadingOverlay =
    currentPath !== null && (isLoading || renderedPath !== currentPath);

  const handleOpenAI = () => {
    useAppStore.getState().openTaskPanelCompose({
      source: "editor",
      pinnedPagePath: currentPath,
      defaultAgentSlug: "editor",
    });
  };

  // Any further edit (typing, clicking away) means "keep the link" — close the menu.
  useEffect(() => {
    if (!pasteMenu || !editor) return;
    const close = () => setPasteMenu(null);
    editor.on("update", close);
    return () => {
      editor.off("update", close);
    };
  }, [pasteMenu, editor]);

  const embedFromPasteMenu = () => {
    if (!pasteMenu || !editor) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pasteMenu.from, to: pasteMenu.to })
      .setEmbed({ url: pasteMenu.url })
      .run();
    setPasteMenu(null);
  };

  if (currentPath === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium tracking-[-0.02em]">
            No page selected
          </p>
          <p className="text-sm text-muted-foreground/70">
            Select a page from the sidebar or create a new one
          </p>
        </div>
      </div>
    );
  }

  // Path resolved to a folder (or otherwise-missing target) without an
  // index.md. Render an explicit placeholder + Create CTA instead of
  // dropping the user into an empty editor that pretends to be the page.
  if (loadStatus === "missing") {
    const slug = currentPath.split("/").pop() || currentPath;
    const inferredTitle = slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const folderNode = findNodeByPath(nodes, currentPath);
    const folderChildren = folderNode?.children ?? [];
    const hasChildren = folderChildren.length > 0;
    // Float the placeholder + folder index on the elevated cream sheet, same
    // as every other editor view — a bare desk-flat column reads as an
    // off-system, unfinished screen (#025).
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <ContentSheet>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
              <div className="space-y-3">
                <p className="text-lg font-medium tracking-[-0.02em] text-foreground">
                  {inferredTitle}
                </p>
                <p className="text-sm text-muted-foreground/80">
                  This folder doesn&apos;t have a markdown sibling page
                  {hasChildren
                    ? " yet — its contents are listed below."
                    : " yet."}
                </p>
                <button
                  onClick={() => void createMissingPage(inferredTitle)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  Create page
                </button>
              </div>
              {hasChildren && (
                <FolderIndex
                  key={currentPath}
                  folderPath={currentPath}
                  entries={folderChildren}
                />
              )}
            </div>
          </div>
        </ContentSheet>
      </div>
    );
  }

  const toggleSourceMode = async () => {
    if (!sourceMode) {
      // Switching TO source mode — show the file as it lives on disk: the
      // YAML frontmatter block followed by the markdown body.
      const { frontmatter, content } = useEditorStore.getState();
      setSourceText(stringifyFrontmatter(frontmatter, content));
      setSourceMode(true);
    } else {
      // Switching FROM source mode — split frontmatter back out of the source,
      // push both halves into the store, and re-render with the properties
      // panel prepended so it survives the round-trip.
      const { frontmatter: parsed, body } = parseFrontmatter(sourceText);
      const store = useEditorStore.getState();
      if (parsed) store.setFrontmatter(parsed as FrontMatter);
      store.updateContent(body);
      if (editor) {
        isLoadingRef.current = true;
        const html = await markdownToHtml(body, assetBase ?? currentPath ?? undefined);
        const fm = useEditorStore.getState().frontmatter;
        const propsHtml = fm ? buildDocumentPropertiesHtml(fm) : "";
        editor.commands.setContent(propsHtml + (html || "<p></p>"));
        setTimeout(() => { isLoadingRef.current = false; }, 50);
      }
      setSourceMode(false);
    }
  };

  // Folder pages with both an index.md (loadStatus === "ok") AND children
  // get a Page / Files tab strip so users can switch between the page body
  // and the directory listing without leaving the route.
  const renderedFolderNode = findNodeByPath(nodes, currentPath);
  const renderedFolderChildren =
    renderedFolderNode?.type === "directory" || renderedFolderNode?.type === "cabinet"
      ? renderedFolderNode.children ?? []
      : [];
  const showFolderTabs = renderedFolderChildren.length > 0;
  const onFilesTab = showFolderTabs && folderTab === "files";

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Chrome row on the desk: folder tabs on the left; on the Page tab the
          formatting toolbar scrolls to the right of them (transparent, faded).
          Only the tabs connect down into the sheet below. */}
      <div className="flex shrink-0 items-end gap-3 ps-4 pe-2 min-h-[34px]">
        {showFolderTabs && (
          <FolderTabs
            className="shrink-0"
            ariaLabel="Page views"
            active={folderTab}
            onSelect={(id) => setFolderTab(id as "page" | "files")}
            tabs={[
              { id: "page", label: "Page" },
              { id: "files", label: "Files", count: renderedFolderChildren.length },
            ]}
          />
        )}
        {!onFilesTab && (
          <div className="min-w-0 flex-1 mb-0.5 animate-in fade-in slide-in-from-left-3 duration-300 ease-out">
            <EditorToolbar
              editor={editor}
              sourceMode={sourceMode}
              onToggleSource={toggleSourceMode}
              wideMode={wideMode}
              onToggleWide={toggleWideMode}
              splitMode={splitMode}
              onToggleSplit={toggleSplitMode}
              onSetMode={handleSetMode}
            />
          </div>
        )}
      </div>
      {/* Files tab: elevated sheet holding the folder index. */}
      {onFilesTab && (
        <ContentSheet>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6">
              <FolderIndex
                key={currentPath}
                folderPath={currentPath}
                entries={renderedFolderChildren}
              />
            </div>
          </div>
        </ContentSheet>
      )}
      {/* The editor body stays MOUNTED on the Files tab (hidden via CSS), else
          Tiptap re-runs createNodeViews and flushSyncs inside a lifecycle. */}
      <div className={onFilesTab ? "hidden" : "flex-1 flex flex-col overflow-hidden min-h-0"}>
      <ContentSheet>
      {sourceMode && (
        <div ref={split.containerRef} className="relative flex-1 flex overflow-hidden border-t border-border" dir={isRtl ? "rtl" : undefined}>
          {/* Left: Code Editor */}
          <div
            className="overflow-hidden p-0 relative min-w-0"
            style={splitMode ? { width: `${split.leftPct}%`, flex: "none" } : { flex: "1 1 0%" }}
            data-editor-scroll
          >
            <div className={`h-full w-full ${wideMode ? "max-w-none" : "max-w-3xl mx-auto"}`}>
              <Editor
                height="100%"
                language="markdown"
                theme={settings.theme === "app" ? (resolvedTheme === "dark" ? "vs-dark" : "light") : settings.theme}
                value={sourceText}
                onChange={(val) => {
                  const value = val || "";
                  setSourceText(value);
                  const hasFrontmatterHeader = /^---\r?\n/.test(value);
                  const { frontmatter: parsed, body } = parseFrontmatter(value);
                  const store = useEditorStore.getState();
                  if (parsed) {
                    store.setFrontmatter(parsed as FrontMatter);
                  } else if (!hasFrontmatterHeader) {
                    store.setFrontmatter({} as FrontMatter);
                  }
                  store.updateContent(body);
                }}
                onMount={(editor, monaco) => {
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    void useEditorStore.getState().save();
                  });
                }}
                options={{
                  minimap: { enabled: true },
                  fontFamily: settings.fontFamily,
                  fontSize: settings.fontSize,
                  fontLigatures: settings.fontLigatures,
                  lineHeight: settings.lineHeight,
                  fontWeight: settings.fontWeight,
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
          {/* Divider */}
          {splitMode && (
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={split.startResize}
              onDoubleClick={split.resetWidth}
              className="relative w-px shrink-0 cursor-col-resize bg-border before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[''] hover:bg-primary/50"
            />
          )}
          {/* Right: Rendered Preview */}
          {splitMode && (
            <div className="flex-1 min-w-0 overflow-y-auto p-8 bg-background prose dark:prose-invert max-w-none">
              <div className="tiptap" dangerouslySetInnerHTML={{ __html: splitHtml }} />
            </div>
          )}
          {/* Drag ruler */}
          {splitMode && split.resizing && (
            <SplitRuler leftPct={split.leftPct} rtl={isRtl} />
          )}
        </div>
      )}
        <div
          className={sourceMode ? "hidden" : "flex-1 relative"}
          dir={isRtl ? "rtl" : undefined}
          style={{ "--editor-max-w": wideMode ? "none" : "48rem" } as React.CSSProperties}
        >
          <FindBar editor={editor} />
          <div className="absolute inset-0 overflow-y-auto" data-editor-scroll>
            {isReadOnlyMount && (
              <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[12px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                Read-only — this folder is connected for viewing. Edits are disabled.
              </div>
            )}
            <EditorContent editor={editor} />
            <EditorBubbleMenu editor={editor} />
            <TableMenu editor={editor} />
            <SlashCommands editor={editor} />
            <EditorMentionPicker editor={editor} />
            {pasteMenu && (
              <PasteLinkMenu
                url={pasteMenu.url}
                top={pasteMenu.top}
                left={pasteMenu.left}
                onEmbed={embedFromPasteMenu}
                onDismiss={() => setPasteMenu(null)}
              />
            )}

            {/* AI Edit Prompt + slash hint */}
            <div className="max-w-(--editor-max-w,48rem) mx-auto px-8 pb-8 flex items-center gap-4">
              <button
                onClick={handleOpenAI}
                className="group flex items-center gap-2 text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
                <span>{t("editorExtras:editWithAi")}</span>
              </button>
              <span className="text-[11px] text-muted-foreground/60 select-none">
                <kbd className="rounded px-1 py-0.5 font-mono text-[10px] ring-1 ring-foreground/10">/</kbd>
                {" "}for commands
              </span>
            </div>
          </div>

          {showLoadingOverlay && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-md z-20 pointer-events-none"
              aria-hidden="true"
            >
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
            </div>
          )}
        </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border text-xs text-muted-foreground/60">
        <span className="text-[11px] text-muted-foreground/70 select-none hidden sm:block">
          <kbd className="rounded px-1 font-mono text-[10px] ring-1 ring-foreground/20">⌘S</kbd>
          {" "}save
          <span className="mx-1.5 opacity-50">·</span>
          <kbd className="rounded px-1 font-mono text-[10px] ring-1 ring-foreground/20">/</kbd>
          {" "}commands
          <span className="mx-1.5 opacity-50">·</span>
          <kbd className="rounded px-1 font-mono text-[10px] ring-1 ring-foreground/20">⌘F</kbd>
          {" "}find
        </span>
        <span>
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed"}
        </span>
      </div>
      </ContentSheet>
      </div>

    </div>
  );
}
