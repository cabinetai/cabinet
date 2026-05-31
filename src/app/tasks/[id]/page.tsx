import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskConversationPage taskId={id} />;
}
