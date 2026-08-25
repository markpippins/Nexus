import { Injectable, signal, inject } from "@angular/core";

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

const VALID_ROLES = ["operator", "planner", "builder", "reviewer", "critic"] as const;
type AgentRole = typeof VALID_ROLES[number];
const DEFAULT_ROLE: AgentRole = "operator";

/** Display label for message box role. "planner" → "Operator" per 9d3f0fa7. */
const ROLE_DISPLAY: Record<string, string> = {
  operator: "Operator",
  planner: "Operator",
  builder: "Builder",
  reviewer: "Reviewer",
  critic: "Critic",
};
export function agentRoleLabel(role: string | null): string {
  return role ? (ROLE_DISPLAY[role] || role) : "Operator";
}

export interface MessageBoxInstance {
  id: string;
  title: string;
  agentRole: AgentRole | null;
  sessionId: string | null;  // Operator session continuity
  minimized: boolean;
  left: number;
  width: number;
  height: number;
  messages: MessageBoxMessage[];
  draft: string;
  submitting: boolean;
}

const DEFAULT_WIDTH = 263;
    const DEFAULT_HEIGHT = 300;  // Increased from 225
const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;
const MARGIN = 16;
const GAP = 12;

@Injectable({ providedIn: "root" })
export class MessageBoxService {
  readonly instances = signal<MessageBoxInstance[]>([]);
  readonly activeId = signal<string | null>(null);

  /**
   * Dock height above the viewport bottom (px). Defaults to the bottom bar
   * (30px). When the console pane is open the app raises this to clear the
   * console resizer + pane so the messagebox never overlaps console UI.
   */
  readonly bottomOffset = signal<number>(30);

  /** Update the dock offset (called by the container when console layout changes). */
  setBottomOffset(px: number): void {
    this.bottomOffset.set(px);
  }

  private idCounter = 0;
  private cachedChatUrl: string | null = null;

  constructor() {
    this.open("Operator");
  }

  /** Fetch the chat server URL, caching the result for subsequent calls. */
  private async getChatUrl(): Promise<string> {
    if (this.cachedChatUrl) return this.cachedChatUrl;
    // Operator service handles chat directly — no more conduit-mcp proxy
    this.cachedChatUrl = "http://localhost:3018";
    return this.cachedChatUrl;
  }

  open(title = "Operator"): string {
    const id = `mbox-${++this.idCounter}`;
    const width = DEFAULT_WIDTH;
    const instance: MessageBoxInstance = {
      id,
      title,
      agentRole: null,
      sessionId: null,
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

    // Parse @role mention from the message.
    const roleMatch = rawText.match(/@(operator|planner|builder|reviewer|critic)\b/i);
    const agentRole: AgentRole = roleMatch
      ? (roleMatch[1].toLowerCase() as AgentRole)
      : DEFAULT_ROLE;

    // Strip the @mention from the display text.
    const displayText = roleMatch
      ? rawText.replace(roleMatch[0], "").trim()
      : rawText;
    const messageText = displayText || rawText;

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
      const chatUrl = await this.getChatUrl();

      // Get session_id for continuity (stored from first response)
      let currentSessionId: string | null = null;
      this.patch(id, (b) => { currentSessionId = b.sessionId; return b; });

      // Send the message directly to the operator service.
      const chatRes = await fetch(`${chatUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: agentRole,
          message: messageText,
          session_id: currentSessionId,
          log_level: "ERROR",
        }),
      });
      if (!chatRes.ok) {
        throw new Error(`Chat server returned ${chatRes.status}`);
      }
      const chatData = await chatRes.json();

      // Save session_id for continuity on subsequent messages
      if (chatData.session_id) {
        this.patch(id, (b) => ({ ...b, sessionId: chatData.session_id }));
      }

      // POST now waits for the LLM response and returns it directly.
      const responseText: string = chatData.response || "";
      if (responseText) {
        let text = this.stripAnsi(responseText);
        const isLogLine = /^[A-Z]+ +\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text);
        if (!isLogLine) {
          this.appendStreamContent(id, text + "\n");
        }
      } else if (chatData.error) {
        this.appendStreamContent(id, `\n[Error: ${chatData.error}]\n`);
      }
    } catch (err: any) {
      this.appendStreamContent(id, `\n[Connection error: ${err.message}]\n`);
    } finally {
      this.finalizeStream(id);
    }
  }

  /** Strip ANSI terminal escape sequences from output. */
  private stripAnsi(text: string): string {
    text = text.replace(/\x1b\[[0-9;]*m/g, '');
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

  /**
   * Height available to the box above the dock offset, minus margin. The box is
   * bottom-docked, so its top edge = viewport - bottomOffset - height; keep the
   * top edge at least MARGIN below the viewport top.
   */
  private maxBoxHeight(): number {
    if (typeof window === "undefined") return 800;
    return Math.max(MIN_HEIGHT, window.innerHeight - this.bottomOffset() - MARGIN);
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
    const max = this.maxBoxHeight();
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
        this.patch(id, b => ({ ...b, messages: [], sessionId: null }));
        break;
      case '/help':
        console.log('[message-box] /help — keyboard shortcuts not yet wired');
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
