import {
    Component,
    ChangeDetectionStrategy,
    inject,
    output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentRegistryService } from '../../services/component-registry.service.js';
import { NodeType } from '../../models/component-config.js';

@Component({
    selector: 'app-component-palette',
    imports: [CommonModule],
    templateUrl: './component-palette.component.html',
    styleUrls: ['./component-palette.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComponentPaletteComponent {
    private registry = inject(ComponentRegistryService);

    // Tools loaded from Registry Service
    toolItems = this.registry.allComponents;

    // Output when a component is selected for addition
    addComponent = output<NodeType>();

    onAddComponent(type: NodeType): void {
        this.addComponent.emit(type);
    }

    getColorHex(color: number): string {
        return '#' + color.toString(16).padStart(6, '0');
    }
}
