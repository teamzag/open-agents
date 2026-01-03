import { tool } from "ai";
import { z } from "zod";
import { todoItemSchema } from "../../types";

export const todoWriteTool = tool({
  description: `Create and manage a structured task list for the current session.

WHEN TO USE:
- Complex multi-step tasks requiring 3 or more distinct steps
- When the user provides multiple requirements or a checklist
- After receiving new instructions - immediately capture them as todos
- When starting work on a task - mark that todo as in_progress BEFORE beginning
- After completing a task - mark it as completed immediately

WHEN NOT TO USE:
- A single, straightforward task that can be done in one step
- Trivial tasks requiring fewer than 3 minor steps
- Purely conversational or informational queries

TASK STATES:
- "todo": Task not yet started
- "in-progress": Currently being worked on (ONLY ONE todo should be in this state at a time)
- "completed": Task finished successfully

USAGE:
- This tool REPLACES the entire todo list - always send the full, updated list of todos
- Use it frequently to keep the task list in sync with your actual progress
- Update statuses as you start and finish work, rather than batching updates later

IMPORTANT:
- Only one todo should be in-progress at a time; avoid parallel in-progress tasks
- Mark todos as completed as soon as they are done - do not wait to batch completions
- Use clear, concise todo content so the list remains readable to the user`,
  inputSchema: z.object({
    todos: z
      .array(todoItemSchema)
      .describe("The complete list of todo items. This replaces existing todos."),
  }),
  execute: async ({ todos }) => {
    return {
      success: true,
      message: `Updated task list with ${todos.length} items`,
      todos,
    };
  },
});

export const todoReadTool = tool({
  description: `Read the current todo list for the session.

USAGE:
- Use this tool to fetch the latest version of the structured todo list
- The todo list is also injected into system context; call this when you specifically need the raw structured data

IMPORTANT:
- This tool is read-only and does NOT modify the todo list
- To change the todo list (add, remove, or update tasks), always use todoWriteTool with the full updated list`,
  inputSchema: z.object({}),
  execute: async () => {
    return {
      message: "Todo list is injected into context. Check the system state.",
    };
  },
});
