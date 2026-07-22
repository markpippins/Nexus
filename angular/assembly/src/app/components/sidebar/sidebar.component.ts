import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Counts } from '../../services/data.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Input() counts: Counts | null = null;
  @Input() mobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  topItems = [
    { route: '/feed', label: 'Feed', icon: 'rss', countKey: 'posts' as keyof Counts },
    { route: '/forums', label: 'Forums', icon: 'users', countKey: 'forums' as keyof Counts },
  ];

  discoverItems = [
    { route: '/conversations', label: 'Conversations', icon: 'message-square-text', countKey: 'conversations' as keyof Counts },
    { route: '/harvests', label: 'Harvests', icon: 'database', countKey: 'harvests' as keyof Counts },
    { route: '/candidates', label: 'Candidates', icon: 'lightbulb', countKey: 'candidates' as keyof Counts },
  ];

  reasonItems = [
    { route: '/intents', label: 'Intent Records', icon: 'scroll-text', countKey: 'intents' as keyof Counts },
    { route: '/agendas', label: 'Agendas', icon: 'list-checks', countKey: 'agendas' as keyof Counts },
    { route: '/specifications', label: 'Specifications', icon: 'file-text', countKey: 'specifications' as keyof Counts },
    { route: '/specs', label: 'Spec Items', icon: 'file-text', countKey: 'specifications' as keyof Counts },
  ];

  executeItems = [
    { route: '/requirements', label: 'Requirements', icon: 'blocks', countKey: 'requirements' as keyof Counts },
    { route: '/work-requests', label: 'Work Requests', icon: 'git-branch', countKey: 'workRequests' as keyof Counts },
    { route: '/plans', label: 'Plans', icon: 'map', countKey: 'plans' as keyof Counts },
  ];

  adminItems = [
    { route: '/assessments', label: 'Assessments', icon: 'clipboard-check', countKey: 'assessments' as keyof Counts },
    { route: '/observations', label: 'Observations', icon: 'eye', countKey: 'observations' as keyof Counts },
    { route: '/reports', label: 'Reports', icon: 'bar-chart-3', countKey: 'reports' as keyof Counts },
    { route: '/agent-records', label: 'Agent Records', icon: 'bot', countKey: 'agentRecords' as keyof Counts },
  ];

  settingsItem = { route: '/settings', label: 'Settings', icon: 'settings' };

  openQuestionsGroup = [
    { route: '/open-questions', label: 'Open Questions', icon: 'help-circle', countKey: 'openQuestions' as keyof Counts },
    { route: '/resolutions', label: 'Resolutions', icon: 'check-circle', countKey: undefined as keyof Counts | undefined },
  ];

  getCount(key: keyof Counts): number | undefined {
    return this.counts ? this.counts[key] : undefined;
  }
}
