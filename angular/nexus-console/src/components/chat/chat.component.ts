import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleGenAI, Chat } from '@google/genai';

declare const process: any;

interface SlashCommand {
  command: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show available commands' },
  { command: '/clear', description: 'Clear the conversation' },
  { command: '/summarize', description: 'Summarize the conversation' },
  { command: '/feedback', description: 'Provide feedback' },
];

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);
  newMessage = signal('');

  slashVisible = signal(false);
  slashFiltered = signal<SlashCommand[]>([]);
  slashSelectedIndex = signal(0);

  private chat: Chat | null = null;

  constructor() {
    let apiKey: string | undefined;
    try {
      // This is the only place we access `process`. If it fails, we catch it.
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        apiKey = process.env.API_KEY;
      }
    } catch (e) {
      console.warn('Could not access process.env.API_KEY. Chat will run in demo mode.');
    }

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        this.chat = ai.chats.create({
          model: 'gemini-2.5-flash',
        });
        this.messages.set([{ role: 'model', text: 'Hello! How can I help you today?' }]);
      } catch (e) {
        console.error("Failed to initialize Gemini Chat", e);
        this.chat = null; // Ensure chat is null on failure
        this.messages.set([
          { role: 'model', text: 'Error: Could not initialize the AI Chat service. The API key might be invalid. Running in demo mode.' }
        ]);
      }
    } else {
      this.chat = null;
      this.messages.set([
        { role: 'model', text: 'Hello! This is a demo chat. I will echo your messages. To enable the real AI chat, please configure a Gemini API key.' }
      ]);
    }
  }

  async sendMessage(): Promise<void> {
    const messageText = this.newMessage().trim();
    if (!messageText || this.isLoading()) {
      return;
    }

    const slashCmd = SLASH_COMMANDS.find(c => messageText.startsWith(c.command));
    if (slashCmd) {
      this.executeCommand(slashCmd.command);
      return;
    }

    this.isLoading.set(true);

    this.messages.update(msgs => [...msgs, { role: 'user', text: messageText }]);
    this.newMessage.set('');
    this.slashVisible.set(false);

    // If there is no real chat session, run in demo/echo mode.
    if (!this.chat) {
      setTimeout(() => {
        const echoMessage = `You said: "${messageText}"`;
        this.messages.update(msgs => [...msgs, { role: 'model', text: echoMessage }]);
        this.isLoading.set(false);
      }, 500);
      return;
    }
    
    // --- Real chat logic ---
    this.messages.update(msgs => [...msgs, { role: 'model', text: '' }]);

    try {
      const result = await this.chat.sendMessageStream({ message: messageText });
      
      for await (const chunk of result) {
        const chunkText = chunk.text;
        this.messages.update(msgs => {
          const lastMsgIndex = msgs.length - 1;
          const updatedMsgs = [...msgs];
          if (updatedMsgs[lastMsgIndex].role === 'model') {
            updatedMsgs[lastMsgIndex].text += chunkText;
          }
          return updatedMsgs;
        });
      }

    } catch (e) {
      console.error("Error sending message to Gemini", e);
      const errorMessage = `Sorry, I encountered an error. Please try again. Details: ${(e as Error).message}`;
      this.messages.update(msgs => {
        const lastMsgIndex = msgs.length - 1;
        const updatedMsgs = [...msgs];
        if (updatedMsgs[lastMsgIndex].role === 'model' && updatedMsgs[lastMsgIndex].text === '') {
          updatedMsgs[lastMsgIndex].text = errorMessage;
        } else {
            updatedMsgs.push({role: 'model', text: errorMessage});
        }
        return updatedMsgs;
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  private executeCommand(command: string): void {
    this.slashVisible.set(false);
    this.newMessage.set('');

    switch (command) {
      case '/clear':
        this.messages.set([]);
        break;
      case '/help':
        const helpLines = SLASH_COMMANDS.map(c => `  ${c.command} - ${c.description}`).join('\n');
        this.messages.update(msgs => [...msgs, { role: 'user', text: command }, { role: 'model', text: `Available commands:\n${helpLines}` }]);
        break;
      case '/summarize':
        this.messages.update(msgs => [...msgs, { role: 'user', text: command }, { role: 'model', text: 'Summarize feature coming soon.' }]);
        break;
      case '/feedback':
        this.messages.update(msgs => [...msgs, { role: 'user', text: command }, { role: 'model', text: 'Feedback feature coming soon.' }]);
        break;
    }
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.newMessage.set(value);
    this.updateSlashState(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.slashVisible()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.slashSelectedIndex.update(i => Math.min(i + 1, this.slashFiltered().length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.slashSelectedIndex.update(i => Math.max(i - 1, 0));
        return;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault();
        const filtered = this.slashFiltered();
        if (filtered.length > 0) {
          this.selectSlashCommand(filtered[this.slashSelectedIndex()]);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.slashVisible.set(false);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  selectSlashCommand(cmd: SlashCommand): void {
    this.newMessage.set(cmd.command);
    this.slashVisible.set(false);
    this.sendMessage();
  }

  private updateSlashState(value: string): void {
    if (value.startsWith('/') && !value.includes(' ')) {
      const query = value.slice(1).toLowerCase();
      this.slashFiltered.set(SLASH_COMMANDS.filter(c => c.command.toLowerCase().includes(query)));
      this.slashVisible.set(true);
      this.slashSelectedIndex.set(0);
    } else {
      this.slashVisible.set(false);
    }
  }
}
