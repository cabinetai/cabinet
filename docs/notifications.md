# In-App Notifications

## Overview

Cabinet has an in-app toast notification system that alerts users when agent conversations (tasks) complete or fail. Notifications appear as slide-in toasts in the bottom-right corner and are clickable to navigate directly to the conversation.

## Current Implementation

### What triggers a notification

- **Conversation completes** (status → `completed`) — green toast with checkmark
- **Conversation fails** (status → `failed`) — red toast with X icon

### Notification content

Each toast displays:
- Agent emoji
- Status badge (Completed / Failed)
- Conversation title
- Agent name

### Behavior

- Toasts auto-dismiss after **8 seconds**
- Can be manually dismissed via the X button (visible on hover)
- **Clicking a toast** navigates to the agent's conversation view for that specific conversation
- Multiple toasts stack vertically (newest at bottom)
- Toasts slide in from the right with a fade animation
- **Sound effects** — synthesized via Web Audio API (no audio files needed):
  - **Success:** ascending two-tone chime (D5 → A5)
  - **Failure:** descending two-tone (A4 → E4)
  - Plays once per notification batch, volume at 15%

### Architecture

```
finalizeConversation()          # conversation-store.ts
  ↓ pushes to in-memory queue
SSE tick (every 3s)             # /api/agents/events
  ↓ drains queue, broadcasts "conversation_completed" event
app-shell.tsx SSE listener
  ↓ dispatches CustomEvent "cabinet:conversation-completed"
NotificationToasts component    # notification-toasts.tsx
  ↓ renders toast, handles click
agents-workspace.tsx listener
  ↓ opens the specific conversation on "cabinet:open-conversation"
```

### Key files

| File | Role |
|------|------|
| `src/lib/agents/conversation-store.ts` | Notification queue + `drainConversationNotifications()` |
| `src/app/api/agents/events/route.ts` | SSE broadcasts `conversation_completed` events |
| `src/components/layout/app-shell.tsx` | Listens to SSE, dispatches DOM CustomEvent |
| `src/components/layout/notification-toasts.tsx` | Toast UI component |
| `src/components/agents/agents-workspace.tsx` | Handles `cabinet:open-conversation` to navigate |

## Future Notification Types (Planned)

The following notification types are not yet implemented but are candidates for the same toast system:

- **Agent task handoffs** — when an agent assigns a task to another agent
- **@human mentions** — when an agent mentions `@human` in Slack (currently only browser notifications)
- **Job schedule triggers** — when a scheduled job kicks off
- **Goal milestones** — when a goal metric crosses a threshold
- **System alerts** — update available, disk space, etc.

## Customization (Future)

- Notification preferences (mute per agent, mute by type)
- Sound alerts
- Notification history panel
- Desktop notifications (Electron)
- Persistent notification badge in header
