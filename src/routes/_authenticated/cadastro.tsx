import { createFileRoute } from "@tanstack/react-router";
import { TaskForm } from "@/components/TaskForm";

export const Route = createFileRoute("/_authenticated/cadastro")({
  head: () => ({ meta: [{ title: "Nova tarefa | Planejador" }] }),
  component: () => <TaskForm />,
});