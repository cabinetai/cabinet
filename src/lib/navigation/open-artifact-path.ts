import { useAppStore, type SelectedSection } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { artifactPathToTreePath } from "@/lib/ui/page-type-icons";

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

export async function openArtifactPath(
  path: string,
  section: SelectedSection
): Promise<void> {
  const { setSection } = useAppStore.getState();
  const { focusPath, loadTree } = useTreeStore.getState();
  const { loadPage } = useEditorStore.getState();

  const treePath = artifactPathToTreePath(path);

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
