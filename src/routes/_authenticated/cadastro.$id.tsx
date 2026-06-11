import { createFileRoute } from "@tanstack/react-router";
import { TaskForm } from "@/components/TaskForm";

export const Route = createFileRoute("/_authenticated/cadastro/$id")({
  head: () => ({ meta: [{ title: "Editar tarefa | Planejador" }] }),
  component: EditTask,
});

function EditTask() {
  const { id } = Route.useParams();
  return <TaskForm taskId={id} />;
}