---
id: private-account-access
references:
  - kind: requirement
    id: create-account
  - kind: requirement
    id: sign-in
  - kind: requirement
    id: sign-out
  - kind: requirement
    id: task-visibility
  - kind: operation
    id: local-http#registerUser
  - kind: operation
    id: local-http#loginUser
  - kind: operation
    id: local-http#getSession
  - kind: operation
    id: local-http#listTodos
  - kind: operation
    id: local-http#logoutUser
  - kind: data-model
    id: local-todo-data
---

As a person using the todo app, I should be able to create an account, return to it, and end my session so that my saved tasks remain available to me and private from others.

On my first visit, I need a way to establish my own account and enter my task list. On later visits, I need to regain access to the same tasks without seeing anyone else's. When I am done—especially on a shared browser—I need a way to leave that account so its tasks are no longer visible there. These moments form one continuing account-access promise; the linked Requirements hold their distinct conditions, outcomes, and code/test maps.

## Related records

- **Requirements:**
  - [`create-account`](../../.sourcespec/requirements/create-account.yaml) — establish an account and begin a session.
  - [`sign-in`](../../.sourcespec/requirements/sign-in.yaml) — return to the account and its saved tasks.
  - [`sign-out`](../../.sourcespec/requirements/sign-out.yaml) — end the current session.
  - [`task-visibility`](../../.sourcespec/requirements/task-visibility.yaml) — keep saved tasks private to the active account.
- **Operations:**
  - [`registerUser`](../../.sourcespec/operations/local-http.yaml) — create an account.
  - [`loginUser`](../../.sourcespec/operations/local-http.yaml) — sign in again.
  - [`getSession`](../../.sourcespec/operations/local-http.yaml) — recognize an existing session.
  - [`listTodos`](../../.sourcespec/operations/local-http.yaml) — load the current account's tasks.
  - [`logoutUser`](../../.sourcespec/operations/local-http.yaml) — sign out.
- **Data model:**
  - [`local-todo-data`](../../.sourcespec/data-models/local-todo.yaml) — users, sessions, and their task ownership.
