import { useState, useEffect, useCallback, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export default function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Task[]>("list_tasks").then((t) => {
      setTasks(t);
      setLoaded(true);
    });
  }, []);

  const addTask = useCallback(() => {
    const title = input.trim();
    if (!title) return;

    const task: Task = {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: Date.now(),
    };
    invoke("save_task", { task });
    setTasks((prev) => [task, ...prev]);
    setInput("");
  }, [input]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, done: !t.done } : t
      );
      const updated = next.find((t) => t.id === id);
      if (updated) invoke("save_task", { task: updated });
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    invoke("delete_task", { id });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTask();
  };

  if (!loaded) {
    return (
      <main className="tasks-view">
        <div className="tasks-empty-state">
          <p>Loading tasks...</p>
        </div>
      </main>
    );
  }

  const incomplete = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  return (
    <main className="tasks-view">
      <div className="tasks-header">
        <h1 className="tasks-title">Tasks</h1>
      </div>
      <div className="tasks-input-wrapper">
        <input
          type="text"
          className="tasks-input"
          placeholder="Add a task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
      <div className="tasks-list">
        {tasks.length === 0 && (
          <div className="tasks-empty-state">
            <p>No tasks yet. Add one above.</p>
          </div>
        )}
        {incomplete.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        ))}
        {completed.length > 0 && (
          <>
            <div className="tasks-section-label">Completed</div>
            {completed.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`task-item ${task.done ? "done" : ""}`}>
      <label className="task-checkbox">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span className="task-checkbox-visual" />
      </label>
      <span className="task-title">{task.title}</span>
      <button
        className="task-delete-btn"
        onClick={() => onDelete(task.id)}
        title="Delete task"
      >
        &times;
      </button>
    </div>
  );
}
