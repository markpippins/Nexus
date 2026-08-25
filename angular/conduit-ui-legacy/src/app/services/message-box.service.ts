import { Injectable, signal, inject } from "@angular/core";
import { AIConfigService } from "./ai-config.service";
import { KeyboardShortcutService } from "./keyboard.service";

export interface SlashCommand {
  command: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show keyboard shortcuts' },
  { command: '/clear', description: 'Clear the conversation' },
  { command: '/summarize', description: 'Summarize the conversation' },
  { command: '/feedback', description: 'Provide feedback' },
];

export interface MessageBoxMessage {
  role: "user" | "assistant";
  content: string;
}

const VALID_ROLES = ["planner", "builder", "reviewer", "critic"] as const;
type AgentRole = typeof VALID_ROLES[number];
const DEFAULT_ROLE: AgentRole = "planner";

/** Display label for message box role. "planner" → "Operator" per 9d3f0fa7. */
export const AGENT_ROLE_DISPLAY: Record<string, string> = {
  planner: "Operator",
  builder: "Builder",
  reviewer: "Reviewer",
  critic: "Critic",
};
export function agentRoleLabel(role: string | null): string {
  return role ? (AGENT_ROLE_DISPLAY[role] || role) : "Assistant";
}

export interface MessageBoxInstance {
  id: string;
  title: string;
  agentRole: AgentRole | null;
  minimized: boolean;
  left: number;
  width: number;
  height: number;
  messages: MessageBoxMessage[];
  draft: string;
  submitting: boolean;
}

const DEFAULT_WIDTH = 263;
const DEFAULT_HEIGHT = 225;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;
const MARGIN = 16;
const GAP = 12;

@Injectable({ providedIn: "root" })
export class MessageBoxService {
  readonly instances = signal<MessageBoxInstance[]>([]);
  readonly activeId = signal<string | null>(null);

  private idCounter = 0;
  private cachedChatUrl: string | null = null;
  private aiConfig = inject(AIConfigService);
  private kb = inject(KeyboardShortcutService);

  constructor() {
    this.open("Assistant");
  }

  /** Fetch the chat server URL, caching the result for subsequent calls. */
  private async getChatUrl(): Promise<string> {
    if (this.cachedChatUrl) return this.cachedChatUrl;
    let url = "http://localhost:3101";
    try {
      const configRes = await fetch("/chat/config");
      const config = await configRes.json();
      url = config.agentChatUrl || url;
    } catch { /* fallback */ }
    this.cachedChatUrl = url;
    return url;
  }

  open(title = "Assistant"): string {
    const id = `mbox-${++this.idCounter}`;
    const width = DEFAULT_WIDTH;
    const instance: MessageBoxInstance = {
      id,
      title,
      agentRole: null,
      minimized: false,
      left: this.defaultLeft(width),
      width,
      height: DEFAULT_HEIGHT,
      messages: [],
      draft: "",
      submitting: false,
    };
    this.instances.update((list) => [...list, instance]);
    this.activeId.set(id);
    return id;
  }

  close(id: string): void {
    this.instances.update((list) => list.filter((b) => b.id !== id));
    if (this.activeId() === id) {
      const remaining = this.instances();
      this.activeId.set(
        remaining.length ? remaining[remaining.length - 1].id : null,
      );
    }
  }

  focus(id: string): void {
    if (this.instances().some((b) => b.id === id)) {
      this.activeId.set(id);
    }
  }

  toggleMinimize(id: string): void {
    this.patch(id, (b) => ({ ...b, minimized: !b.minimized }));
    this.focus(id);
  }

  updateDraft(id: string, draft: string): void {
    this.patch(id, (b) => ({ ...b, draft }));
  }

  updatePosition(id: string, left: number): void {
    const box = this.instances().find((b) => b.id === id);
    if (!box) return;
    this.patch(id, (b) => ({ ...b, left: this.clampLeft(left, b.width) }));
  }

  updateSize(id: string, left: number, width: number, height: number): void {
    this.patch(id, (b) => ({
      ...b,
      left: this.clampLeft(left, width),
      width: this.clampWidth(width),
      height: this.clampHeight(height),
    }));
  }

  async submit(id: string): Promise<void> {
    const box = this.instances().find((b) => b.id === id);
    if (!box || box.submitting) return;

    const rawText = box.draft.trim();
    if (!rawText) return;

    // Handle slash commands.
    const slashCmd = SLASH_COMMANDS.find(c => rawText.startsWith(c.command));
    if (slashCmd) {
      this.executeCommand(id, slashCmd.command);
      return;
    }

    // Parse @role mention from the message (e.g. "@planner What is the state?").
    const roleMatch = rawText.match(/@(planner|builder|reviewer|critic)\b/i);
    const agentRole: AgentRole = roleMatch
      ? (roleMatch[1].toLowerCase() as AgentRole)
      : DEFAULT_ROLE;

    // Strip the @mention from the display text so the agent gets a clean prompt.
    const displayText = roleMatch
      ? rawText.replace(roleMatch[0], "").trim()
      : rawText;
    const messageText = displayText || rawText; // never send empty

    // Update title to show which agent is responding.
    this.patch(id, (b) => ({
      ...b,
      agentRole,
      title: agentRole.charAt(0).toUpperCase() + agentRole.slice(1),
      draft: "",
      submitting: true,
      messages: [...b.messages, { role: "user", content: rawText }],
    }));

    try {
      // 1. Get the chat server URL (cached after first fetch).
      const chatUrl = await this.getChatUrl();

      // 2. Send the message via the MCP proxy.
      const chatRes = await fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: agentRole,
          message: messageText,
          log_level: this.aiConfig.logSettings().promptLogLevel,
        }),
      });
      if (!chatRes.ok) {
        throw new Error(`Chat server returned ${chatRes.status}`);
      }
      const chatData = await chatRes.json();
      const sessionId: string = chatData.session_id;
      if (!sessionId) {
        throw new Error(chatData.error || "No session_id returned");
      }

      // 3. Stream the agent's response via SSE.
      const streamUrl = `${chatUrl}/chat/stream/${sessionId}`;
      let streamBuffer = "";

      const response = await fetch(streamUrl);
      if (!response.ok) {
        throw new Error(`Stream error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;

        const chunk = decoder.decode(value, { stream: true });
        streamBuffer += chunk;

        // Process complete SSE events.
        const lines = streamBuffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer.
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;

          try {
            const event = JSON.parse(payload);
            if (event.type === "line" && event.text) {
              let text = this.stripAnsi(event.text);
              // Match opencode log format: "INFO  2026-06-10T00:38:28 +0ms service=..."
              // Use one-or-more spaces not fixed-width — level field is padded to 7 chars
              // (INFO=4 chars + 3 spaces, ERROR=5 chars + 2 spaces, etc.)
              const isLogLine = /^[A-Z]+ +\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text);
              if (isLogLine) {
                const level = this.aiConfig.logSettings().messageBoxLogLevel;
                if (level === 'NONE') continue;
                if (level === 'ERROR' && !text.startsWith('ERROR ')) continue;
              }
              this.appendStreamContent(id, text + "\n");
            } else if (event.type === "error") {
              this.appendStreamContent(id, `\n[Error: ${event.text}]\n`);
            } else if (event.type === "done") {
              done = true;
            } else if (event.type === "close") {
              done = true;
            }
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch (err: any) {
      this.appendStreamContent(id, `\n[Connection error: ${err.message}]\n`);
    } finally {
      this.finalizeStream(id);
    }
  }

  /** Strip ANSI terminal escape sequences from OpenCode output.
   *  Handles both full ESC-prefixed codes (\x1b[0m) and stripped codes
   *  where the ESC byte was lost in transit ([0m, [90m, etc.). */
  private stripAnsi(text: string): string {
    // Full ANSI SGR: ESC[ + digits/semicolons + m
    text = text.replace(/\x1b\[[0-9;]*m/g, '');
    // Stripped SGR codes (missing ESC): [ + digits + m
    text = text.replace(/\[[0-9]+m/g, '');
    return text;
  }

  /** Append text to the last assistant message (streaming). */
  private appendStreamContent(id: string, text: string): void {
    this.patch(id, (b) => {
      const msgs = [...b.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant" && b.submitting) {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ role: "assistant", content: text });
      }
      return { ...b, messages: msgs };
    });
  }

  /** Mark streaming as finished. */
  private finalizeStream(id: string): void {
    this.patch(id, (b) => ({ ...b, submitting: false }));
  }

  clampLeft(left: number, width: number): number {
    if (typeof window === "undefined") return left;
    const maxLeft = Math.max(MARGIN, window.innerWidth - width - MARGIN);
    return Math.max(MARGIN, Math.min(left, maxLeft));
  }

  private defaultLeft(width: number): number {
    if (typeof window === "undefined") return MARGIN;
    const boxes = this.instances();
    if (boxes.length === 0) {
      return window.innerWidth - width - MARGIN;
    }
    const minLeft = Math.min(...boxes.map((b) => b.left));
    const next = minLeft - width - GAP;
    return this.clampLeft(next, width);
  }

  private clampWidth(width: number): number {
    const max = typeof window !== "undefined" ? window.innerWidth * 0.9 : 1200;
    return Math.max(MIN_WIDTH, Math.min(width, max));
  }

  private clampHeight(height: number): number {
    const max = typeof window !== "undefined" ? window.innerHeight * 0.8 : 800;
    return Math.max(MIN_HEIGHT, Math.min(height, max));
  }

  getFilteredCommands(query: string): SlashCommand[] {
    if (!query) return SLASH_COMMANDS;
    const lower = query.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.command.toLowerCase().includes(lower));
  }

  executeCommand(id: string, command: string): void {
    this.patch(id, b => ({ ...b, draft: '' }));
    switch (command) {
      case '/clear':
        this.patch(id, b => ({ ...b, messages: [] }));
        break;
      case '/help':
        this.kb.toggleHelp();
        break;
      case '/summarize':
        this.patch(id, b => ({
          ...b,
          messages: [...b.messages, { role: 'user', content: command }, { role: 'assistant', content: 'Summarize feature coming soon.' }],
        }));
        break;
      case '/feedback':
        this.patch(id, b => ({
          ...b,
          messages: [...b.messages, { role: 'user', content: command }, { role: 'assistant', content: 'Feedback feature coming soon.' }],
        }));
        break;
    }
  }

  private patch(
    id: string,
    fn: (box: MessageBoxInstance) => MessageBoxInstance,
  ): void {
    this.instances.update((list) => list.map((b) => (b.id === id ? fn(b) : b)));
  }
}
