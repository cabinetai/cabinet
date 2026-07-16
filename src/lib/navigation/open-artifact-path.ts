import { useAppStore, type SelectedSection } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import {
  resolveArtifactTreePath,
  isExternalArtifactPath,
} from "@/lib/ui/page-type-icons";

const NON_TEXT_ARTIFACT_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
];

const VIEWER_ONLY_NODE_TYPES = new Set(["app", "website"]);

function shouldLoadArtifactContent(treePath: string): boolean {
  const normalized = treePath.toLowerCase();
  if (NON_TEXT_ARTIFACT_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
    return false;
  }
  const node = findNodeByPath(useTreeStore.getState().nodes, treePath);
  if (node && VIEWER_ONLY_NODE_TYPES.has(node.type)) return false;
  return true;
}

/**
 * Surface an "outside cabinet" toast for an artifact the page API can't open
 * (it lives outside DATA_DIR). Shared by every artifact-navigation surface so
 * a click lands on a clear message instead of a blank editor.
 */
export function notifyExternalArtifact(path: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cabinet:toast", {
      detail: { kind: "info", message: `Outside cabinet: ${path}` },
    })
  );
}

export async function openArtifactPath(
  path: string,
  section: SelectedSection
): Promise<void> {
  if (isExternalArtifactPath(path)) {
    notifyExternalArtifact(path);
    return;
  }

  const { setSection } = useAppStore.getState();
  const { focusPath, loadTree } = useTreeStore.getState();
  const { loadPage } = useEditorStore.getState();

  const treePath = resolveArtifactTreePath(path, section.cabinetPath);

  setSection(section);
  focusPath(treePath);

  const work: Promise<unknown>[] = [
    loadTree()
      .then(() => {
        useTreeStore.getState().focusPath(treePath);
      })
      .catch(() => {}),
  ];

  if (shouldLoadArtifactContent(treePath)) {
    work.push(loadPage(treePath).catch(() => {}));
  }

  await Promise.allSettled(work);
}
