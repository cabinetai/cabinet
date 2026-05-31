import { TasksBoard } from "@/components/tasks/board";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ cabinet?: string }>;

/**
 * /tasks — the only board. The legacy flat list and `?board=v1` escape
 * hatch were removed after feature parity.
 */
export default async function TasksIndexPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  return (
    <div className="h-screen">
      <TasksBoard cabinetPath={params.cabinet ?? "."} standalone />
    </div>
  );
}
