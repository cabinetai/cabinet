import { create } from "zustand";

// Visibility-only state for the in-page find bar. The actual search lives in
// the editor's `cabinetFind` ProseMirror plugin; this store just lets the
// global Cmd+F hotkey open the bar from anywhere.
interface FindState {
  open: boolean;
  openFind: () => void;
  closeFind: () => void;
}

export const useFindStore = create<FindState>((set) => ({
  open: false,
  openFind: () => set({ open: true }),
  closeFind: () => set({ open: false }),
}));
