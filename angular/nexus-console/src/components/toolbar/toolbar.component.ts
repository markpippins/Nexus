import { Component, ChangeDetectionStrategy, output, signal, ElementRef, inject, viewChild, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DestinationNodeComponent } from '../destination-node/destination-node.component.js';
import { FileSystemNode } from '../../models/file-system.model.js';
import { Theme } from '../../services/ui-preferences.service.js';

export type SortKey = 'name' | 'modified';
export type SortDirection = 'asc' | 'desc';
export interface SortCriteria {
  key: SortKey;
  direction: SortDirection;
}

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DestinationNodeComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  }
})
export class ToolbarComponent {
  private elementRef = inject(ElementRef);
  isNewDropdownOpen = signal(false);
  isSortDropdownOpen = signal(false);
  isCopyToOpen = signal(false);
  isMoveToOpen = signal(false);
  isHamburgerMenuOpen = signal(false);
  isColorPickerOpen = signal(false);

  // View mode inputs
  viewMode = input<'file-explorer' | 'service-mesh'>('file-explorer');
  meshViewMode = input<'console' | 'graph'>('console');

  // Inputs for button states (file explorer)
  canCreate = input(true);
  canCut = input(false);
  canCopy = input(false);
  canCopyToMoveTo = input(false);
  canPaste = input(false);
  canRename = input(false);
  canShare = input(false);
  canDelete = input(false);
  canMagnetize = input(false);
  currentSort = input<SortCriteria>({ key: 'name', direction: 'asc' });
  folderTree = input<FileSystemNode | null>(null);
  currentPath = input<string[]>([]);
  displayMode = input<'grid' | 'list'>('grid');
  filterQuery = input('');
  isSplitViewActive = input(false);
  isDetailPaneActive = input(false);

  // Inputs for pane visibility status
  isSidebarVisible = input(true);
  isTreeVisible = input(true);
  isChatVisible = input(true);
  isNotesVisible = input(true);
  isSavedItemsVisible = input(true);
  isRssFeedVisible = input(true);
  isStreamVisible = input(true);
  isHomeContext = input(false);

  // Management context
  managementType = input<string | undefined>(undefined);
  isGatewayContext = input(false);
  isGatewaysNodeSelected = input(false);
  isGatewaySelected = input(false);
  isServiceRegistryContext = input(false);
  isServiceRegistriesNodeSelected = input(false);
  isServiceRegistrySelected = input(false);
  isPlatformManagementContext = input(false);
  canSave = input(false);

  // Visibility flags
  showExtendedControls = input(true);
  showAllControls = input(true);

  // Service Mesh / Graph inputs
  graphInteractionMode = input<'camera' | 'edit'>('camera');
  isSimulationActive = input(false);
  backgroundColor = input('#000510');
  graphSubView = input<'canvas' | 'creator'>('canvas');

  // Outputs for events (file explorer)
  newFolderClick = output<void>();
  newFileClick = output<void>();
  filesUploaded = output<FileList>();
  cutClick = output<void>();
  copyClick = output<void>();
  copyItemsTo = output<string[]>();
  moveItemsTo = output<string[]>();
  pasteClick = output<void>();
  renameClick = output<void>();
  shareClick = output<void>();
  deleteClick = output<void>();
  magnetizeClick = output<void>();
  sortChange = output<SortCriteria>();
  displayModeChange = output<'grid' | 'list'>();
  filterChange = output<string>();
  splitViewClick = output<void>();
  detailPaneClick = output<void>();
  saveClick = output<void>();
  resetClick = output<void>();
  themeMenuClick = output<HTMLElement>();
  rssFeedsMenuClick = output<void>();
  preferencesMenuClick = output<void>();

  // Outputs for pane visibility toggles
  toggleSidebar = output<void>();
  toggleTree = output<void>();
  toggleChat = output<void>();
  toggleNotes = output<void>();
  toggleSavedItems = output<void>();
  toggleRssFeed = output<void>();
  toggleStream = output<void>();

  // Graph/Mesh outputs
  graphModeChange = output<'camera' | 'edit'>();
  toggleSimulation = output<void>();
  saveGraph = output<void>();
  loadGraph = output<void>();
  backgroundColorChange = output<string>();
  zoomIn = output<void>();
  zoomOut = output<void>();
  rotateLeft = output<void>();
  rotateRight = output<void>();
  resetCamera = output<void>();
  clearGraph = output<void>();
  graphSubViewChange = output<'canvas' | 'creator'>();

  // Import capability
  canImport = input(false);
  importClick = output<void>();

  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  colorInput = viewChild<ElementRef<HTMLInputElement>>('colorInput');

  onColorChange(event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.backgroundColorChange.emit(color);
  }

  openColorPicker(): void {
    this.colorInput()?.nativeElement.click();
  }

  toggleNewDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isNewDropdownOpen.update(v => !v);
  }

  toggleSortDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isSortDropdownOpen.update(v => !v);
  }

  toggleCopyToDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isMoveToOpen.set(false);
    this.isCopyToOpen.update(v => !v);
  }

  toggleMoveToDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isCopyToOpen.set(false);
    this.isMoveToOpen.update(v => !v);
  }

  toggleHamburgerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isHamburgerMenuOpen.update(v => !v);
  }

  onThemeMenuItemClick(buttonElement: HTMLElement): void {
    this.themeMenuClick.emit(buttonElement);
    this.isHamburgerMenuOpen.set(false);
  }

  onRssFeedsMenuItemClick(): void {
    this.rssFeedsMenuClick.emit();
    this.isHamburgerMenuOpen.set(false);
  }

  onPreferencesMenuItemClick(): void {
    this.preferencesMenuClick.emit();
    this.isHamburgerMenuOpen.set(false);
  }

  onNewFolderItemClick(): void {
    this.newFolderClick.emit();
    this.isNewDropdownOpen.set(false);
  }

  onNewFileItemClick(): void {
    this.newFileClick.emit();
    this.isNewDropdownOpen.set(false);
  }

  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      if (this.isNewDropdownOpen()) this.isNewDropdownOpen.set(false);
      if (this.isSortDropdownOpen()) this.isSortDropdownOpen.set(false);
      if (this.isCopyToOpen()) this.isCopyToOpen.set(false);
      if (this.isMoveToOpen()) this.isMoveToOpen.set(false);
      if (this.isHamburgerMenuOpen()) this.isHamburgerMenuOpen.set(false);
    }
  }

  onUploadButtonClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.filesUploaded.emit(input.files);
      input.value = '';
    }
  }

  onSort(key: SortKey, direction: SortDirection): void {
    this.sortChange.emit({ key, direction });
    this.isSortDropdownOpen.set(false);
  }

  onDestinationSelectedForCopy(path: string[]): void {
    this.copyItemsTo.emit(path);
    this.isCopyToOpen.set(false);
  }

  onDestinationSelectedForMove(path: string[]): void {
    this.moveItemsTo.emit(path);
    this.isCopyToOpen.set(false);
  }

  onFilterInputChange(event: Event): void {
    this.filterChange.emit((event.target as HTMLInputElement).value);
  }
}