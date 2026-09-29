---
id: manage-tasks
references:
  - kind: requirement
    id: add-task
  - kind: requirement
    id: change-task-completion
  - kind: requirement
    id: remove-task
  - kind: requirement
    id: task-visibility
  - kind: operation
    id: local-http#listTodos
  - kind: operation
    id: local-http#createTodo
  - kind: operation
    id: local-http#setTodoCompleted
  - kind: operation
    id: local-http#removeTodo
  - kind: data-model
    id: local-todo-data
---

As a signed-in person, I should be able to add, complete, reopen, and remove my own tasks so that my list reflects what I still need to do.

I need to capture new tasks as they occur, mark them complete when they are done, and reopen them if there is still work left. I also need to remove tasks I no longer want in the list. These actions belong together because they let me maintain one useful, private task list over time. Account access is a prerequisite, not another part of this Story; the linked Requirements own the exact conditions, outcomes, and code/test maps.

## Related records

- **Requirements:**
  - [`add-task`](../../.sourcespec/requirements/add-task.yaml) — capture a new task.
  - [`change-task-completion`](../../.sourcespec/requirements/change-task-completion.yaml) — complete or reopen a task.
  - [`remove-task`](../../.sourcespec/requirements/remove-task.yaml) — remove a task from the list.
  - [`task-visibility`](../../.sourcespec/requirements/task-visibility.yaml) — see only tasks in the current account.
- **Operations:**
  - [`listTodos`](../../.sourcespec/operations/local-http.yaml) — load the current account's tasks.
  - [`createTodo`](../../.sourcespec/operations/local-http.yaml) — save a new task.
  - [`setTodoCompleted`](../../.sourcespec/operations/local-http.yaml) — change completion.
  - [`removeTodo`](../../.sourcespec/operations/local-http.yaml) — delete a task.
- **Data model:**
  - [`local-todo-data`](../../.sourcespec/data-models/local-todo.yaml) — task ownership and saved completion state.
