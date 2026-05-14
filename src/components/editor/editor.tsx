"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Sparkles, Code2, Loader2, FilePlus } from "lucide-react";
import { editorExtensions } from "./extensions";
import { EditorToolbar } from "./editor-toolbar";
import { SlashCommands } from "./slash-commands";
import { EditorMentionPicker } from "./mention-picker";
import { EditorBubbleMenu } from "./bubble-menu";
import { TableMenu } from "./table-menu";
import { FolderIndex } from "./folder-index";
import { useEditorStore } from "@/stores/editor-store";
import { useAIPanelStore } from "@/stores/ai-panel-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { htmlToMarkdown } from "@/lib/markdown/to-markdown";
import { detectEmbed } from "@/lib/embeds/detect";
import { cellAround, isInTable } from "@tiptap/pm/tables";
import type { TreeNode } from "@/types";
import { useLocale } from "@/i18n/use-locale";

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
  // The slug matches the last segment of the path
  const matches = allPages.filter((p) => p.name === slug || p.path.endsWith("/" + slug));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].path;

  // Prefer sibling pages (same parent directory as current page)
  if (currentPath) {
    const parentDir = currentPath.includes("/")
      ? currentPath.substring(0, currentPath.lastIndexOf("/"))
      : "";
    const sibling = matches.find(
      (m) => m.path === (parentDir ? parentDir + "/" + slug : slug)
    );
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
  let linkPath = href
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
  const { currentPath, content, saveStatus, frontmatter, isLoading, loadStatus, createMissingPage } = useEditorStore();
  const nodes = useTreeStore((s) => s.nodes);
  const isRtl = frontmatter?.dir === "rtl";
  const { open: openAI, clearMessages } = useAIPanelStore();
  const isLoadingRef = useRef(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  // Reset the tab to "page" whenever the path changes — opening a new folder
  // shouldn't skip its index.md if the previous folder was on Files. Has to
  // be an effect (not state-during-render) because Tiptap's EditorContent
  // calls flushSync internally; setState during the parent render explodes
  // when EditorContent renders in the same pass.
  const [folderTab, setFolderTab] = useState<"page" | "files">("page");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolderTab("page");
  }, [currentPath]);

  const handleUpdate = useCallback(
    ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
      if (isLoadingRef.current || !editor) return;
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      useEditorStore.getState().updateContent(md);
    },
    []
  );

  const handlePasteOrDrop = useCallback(
    async (files: FileList) => {
      const pagePath = useEditorStore.getState().currentPath;
      if (!pagePath) return;

      for (const file of Array.from(files)) {
        const url = await uploadFile(pagePath, file);
        if (!url) continue;
        // For now insert via the editor reference stored separately
        // This is handled by the editorProps below
      }
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
          "focus:outline-none min-h-[calc(100vh-12rem)] px-4 sm:px-8 py-6 max-w-3xl mx-auto",
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

          // Internal links: relative paths to .md files or other KB pages
          // Skip external URLs and API asset links (PDFs, images)
          if (/^https?:\/\//.test(href) || href.startsWith("/api/")) return false;
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
            const { $from } = editor.state.selection;
            const onEmptyLine = $from.parent.textContent.length === 0;
            if (!isGenericFallback || onEmptyLine) {
              editor.commands.setEmbed({ url: text });
              return true;
            }
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

  // When content updates from store (after loadPage), set it in editor
  const prevPathRef = useRef<string | null>(null);
  const renderedKeyRef = useRef<string | null>(null);
  const [renderedPath, setRenderedPath] = useState<string | null>(null);
  useEffect(() => {
    if (!editor || currentPath === null) return;
    // Skip if content hasn't actually changed (same path, dirty edit)
    if (useEditorStore.getState().isDirty && currentPath === prevPathRef.current) return;
    // During page navigation the store briefly holds content="" while the
    // fetch is in flight. Rendering that empty string into ProseMirror is
    // pure waste — every extension runs a full schema pass twice per
    // navigation. Skip until the real content arrives.
    if (isLoading && content === "") return;
    // Dedupe identical (path, content) renders — e.g. cached paint followed
    // by a fresh fetch that returned the same markdown.
    const key = `${currentPath} ${content}`;
    if (renderedKeyRef.current === key) {
      if (renderedPath !== currentPath) setRenderedPath(currentPath);
      return;
    }
    prevPathRef.current = currentPath;

    const setContent = async () => {
      isLoadingRef.current = true;
      const html = await markdownToHtml(content, currentPath);
      editor.commands.setContent(html);
      renderedKeyRef.current = key;
      setRenderedPath(currentPath);
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 50);
    };

    setContent();
  }, [editor, content, currentPath, isLoading, renderedPath]);

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
    clearMessages();
    openAI();
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
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          <div className="space-y-3">
            <p className="text-lg font-medium tracking-[-0.02em] text-foreground">
              {inferredTitle}
            </p>
            <p className="text-sm text-muted-foreground/80">
              This folder doesn&apos;t have an{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-[12px]">index.md</code>
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
    );
  }

  const toggleSourceMode = async () => {
    if (!sourceMode) {
      // Switching TO source mode — grab current markdown
      setSourceText(useEditorStore.getState().content);
      setSourceMode(true);
    } else {
      // Switching FROM source mode — apply changes
      useEditorStore.getState().updateContent(sourceText);
      if (editor) {
        isLoadingRef.current = true;
        const html = await markdownToHtml(sourceText, currentPath ?? undefined);
        editor.commands.setContent(html);
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {showFolderTabs && (
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-border">
          <button
            onClick={() => setFolderTab("page")}
            className={`px-3 py-1.5 text-[12px] rounded-t-md border-b-2 -mb-px transition-colors ${
              folderTab === "page"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={folderTab === "page"}
          >
            Page
          </button>
          <button
            onClick={() => setFolderTab("files")}
            className={`px-3 py-1.5 text-[12px] rounded-t-md border-b-2 -mb-px transition-colors ${
              folderTab === "files"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={folderTab === "files"}
          >
            Files
            <span className="ml-1.5 text-muted-foreground/60">
              {renderedFolderChildren.length}
            </span>
          </button>
        </div>
      )}
      {onFilesTab ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <FolderIndex
              key={currentPath}
              folderPath={currentPath}
              entries={renderedFolderChildren}
            />
          </div>
        </div>
      ) : (
      <>
      <div className="flex items-center min-w-0">
        <div className="flex-1 min-w-0">
          {!sourceMode && <EditorToolbar editor={editor} />}
        </div>
        <button
          onClick={toggleSourceMode}
          className={`flex items-center gap-1.5 px-3 py-1 mr-2 text-[11px] rounded-md transition-colors border border-border ${
            sourceMode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Code2 className="h-3 w-3" />
          {sourceMode ? "Preview" : "Markdown"}
        </button>
      </div>

      {sourceMode ? (
        <div className="flex-1 overflow-y-auto p-4" dir={isRtl ? "rtl" : undefined}>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="w-full h-full min-h-[calc(100vh-12rem)] bg-transparent font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex-1 relative" dir={isRtl ? "rtl" : undefined}>
          <div className="absolute inset-0 overflow-y-auto" data-editor-scroll>
            <EditorContent editor={editor} />
            <EditorBubbleMenu editor={editor} />
            <TableMenu editor={editor} />
            <SlashCommands editor={editor} />
            <EditorMentionPicker editor={editor} />

            {/* AI Edit Prompt + slash hint */}
            <div className="max-w-3xl mx-auto px-8 pb-8 flex items-center gap-4">
              <button
                onClick={handleOpenAI}
                className="group flex items-center gap-2 text-[13px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
                <span>{t("editorExtras:editWithAi")}</span>
              </button>
              <span className="text-[11px] text-muted-foreground/30 select-none">
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
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border text-xs text-muted-foreground/60">
        <span className="text-[10.5px] text-muted-foreground/30 select-none hidden sm:block">
          <kbd className="rounded px-1 font-mono text-[9.5px] ring-1 ring-foreground/10">⌘S</kbd>
          {" "}save
          <span className="mx-1.5 opacity-40">·</span>
          <kbd className="rounded px-1 font-mono text-[9.5px] ring-1 ring-foreground/10">/</kbd>
          {" "}commands
        </span>
        <span>
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed"}
        </span>
      </div>
      </>
      )}

    </div>
  );
}
