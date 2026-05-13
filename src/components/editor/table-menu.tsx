"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  PanelLeft,
  PanelTop,
  Rows3,
  Table,
  Trash2,
} from "lucide-react";
import {
  cellAround,
  isInTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@tiptap/pm/tables";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface TableMenuProps {
  editor: Editor | null;
}

interface TableButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  onAction: () => void;
}

function TableButton({
  label,
  icon: Icon,
  disabled,
  active,
  danger,
  onAction,
}: TableButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onAction();
      }}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded text-foreground/80 hover:bg-accent transition-colors disabled:pointer-events-none disabled:opacity-35",
        active && "bg-accent text-foreground",
        danger && "text-destructive hover:bg-destructive/10"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Separator() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}

export function TableMenu({ editor }: TableMenuProps) {
  const { t } = useLocale();
  if (!editor) return null;

  const getRect = () => {
    if (!isInTable(editor.state)) return null;
    try {
      return selectedRect(editor.state);
    } catch {
      return null;
    }
  };

  const run = (action: () => boolean) => {
    const ok = action();
    if (ok) {
      editor.commands.focus();
      editor.commands.fixTables();
    }
  };

  const moveRow = (direction: -1 | 1) => {
    const rect = getRect();
    if (!rect) return;
    const from = rect.top;
    const to = from + direction;
    if (to < 0 || to >= rect.map.height) return;
    moveTableRow({ from, to })(editor.state, editor.view.dispatch);
    editor.commands.focus();
  };

  const moveColumn = (direction: -1 | 1) => {
    const rect = getRect();
    if (!rect) return;
    const from = rect.left;
    const to = from + direction;
    if (to < 0 || to >= rect.map.width) return;
    moveTableColumn({ from, to })(editor.state, editor.view.dispatch);
    editor.commands.focus();
  };

  const selectCellText = () => {
    const $cell = cellAround(editor.state.selection.$from);
    const cell = $cell?.nodeAfter;
    if (!$cell || !cell) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: $cell.pos + 1, to: $cell.pos + cell.nodeSize - 1 })
      .run();
  };

  const rect = getRect();
  const canMoveRowUp = !!rect && rect.top > 0;
  const canMoveRowDown = !!rect && rect.top < rect.map.height - 1;
  const canMoveColumnLeft = !!rect && rect.left > 0;
  const canMoveColumnRight = !!rect && rect.left < rect.map.width - 1;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      options={{ placement: "top", offset: 10 }}
      shouldShow={({ editor: activeEditor }) => activeEditor.isActive("table")}
      className="flex items-center gap-0.5 rounded-md border border-border bg-popover px-1 py-1 shadow-lg"
    >
      <TableButton label={t("editor:toolbar.table.selectCellText")} icon={Table} onAction={selectCellText} />
      <Separator />
      <TableButton
        label={t("editor:toolbar.table.addRowAbove")}
        icon={Rows3}
        onAction={() => run(() => editor.chain().focus().addRowBefore().run())}
      />
      <TableButton
        label={t("editor:toolbar.table.addRowBelow")}
        icon={ArrowDown}
        onAction={() => run(() => editor.chain().focus().addRowAfter().run())}
      />
      <TableButton
        label={t("editor:toolbar.table.moveRowUp")}
        icon={ArrowUp}
        disabled={!canMoveRowUp}
        onAction={() => moveRow(-1)}
      />
      <TableButton
        label={t("editor:toolbar.table.moveRowDown")}
        icon={ArrowDown}
        disabled={!canMoveRowDown}
        onAction={() => moveRow(1)}
      />
      <TableButton
        label={t("editor:toolbar.table.deleteRow")}
        icon={Trash2}
        danger
        onAction={() => run(() => editor.chain().focus().deleteRow().run())}
      />
      <Separator />
      <TableButton
        label={t("editor:toolbar.table.addColumnBefore")}
        icon={Columns3}
        onAction={() => run(() => editor.chain().focus().addColumnBefore().run())}
      />
      <TableButton
        label={t("editor:toolbar.table.addColumnAfter")}
        icon={ArrowRight}
        onAction={() => run(() => editor.chain().focus().addColumnAfter().run())}
      />
      <TableButton
        label={t("editor:toolbar.table.moveColumnLeft")}
        icon={ArrowLeft}
        disabled={!canMoveColumnLeft}
        onAction={() => moveColumn(-1)}
      />
      <TableButton
        label={t("editor:toolbar.table.moveColumnRight")}
        icon={ArrowRight}
        disabled={!canMoveColumnRight}
        onAction={() => moveColumn(1)}
      />
      <TableButton
        label={t("editor:toolbar.table.deleteColumn")}
        icon={Trash2}
        danger
        onAction={() => run(() => editor.chain().focus().deleteColumn().run())}
      />
      <Separator />
      <TableButton
        label={t("editor:toolbar.table.toggleHeaderRow")}
        icon={PanelTop}
        onAction={() => run(() => editor.chain().focus().toggleHeaderRow().run())}
      />
      <TableButton
        label={t("editor:toolbar.table.toggleHeaderColumn")}
        icon={PanelLeft}
        onAction={() => run(() => editor.chain().focus().toggleHeaderColumn().run())}
      />
      <Separator />
      <TableButton
        label={t("editor:toolbar.table.deleteTable")}
        icon={Trash2}
        danger
        onAction={() => editor.chain().focus().deleteTable().run()}
      />
    </BubbleMenu>
  );
}
