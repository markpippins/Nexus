import {
    Component,
    ChangeDetectionStrategy,
    inject,
    computed,
    input,
    output,
    effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchitectureVizService, NodeData } from '../../services/architecture-viz.service.js';
import { ComponentRegistryService } from '../../services/component-registry.service.js';

@Component({
    selector: 'app-object-inspector',
    imports: [CommonModule, FormsModule],
    templateUrl: './object-inspector.component.html',
    styleUrls: ['./object-inspector.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObjectInspectorComponent {
    private vizService = inject(ArchitectureVizService);
    private registry = inject(ComponentRegistryService);

    // Get selected node from viz service
    selectedNodeData = this.vizService.selectedNodeData;
    allNodes = this.vizService.allNodes;

    // Form Models
    formLabel = '';
    formDesc = '';
    formColor = '#ffffff';
    formX = 0;
    formY = 0;
    formZ = 0;

    // Connection Form
    selectedTargetId = '';

    // Computed list of nodes we can connect to
    availableTargets = computed(() => {
        const current = this.selectedNodeData();
        const all = this.allNodes();
        if (!current) return [];

        const config = this.registry.getConfig(current.type);

        return all.filter(n => {
            if (n.id === current.id) return false;
            if (current.connectedTo.includes(n.id)) return false;
            if (config.allowedConnections && config.allowedConnections !== 'all' && !config.allowedConnections.includes(n.type)) return false;
            return true;
        }).sort((a, b) => a.label.localeCompare(b.label));
    });

    // Derived list of current connections
    currentConnections = computed(() => {
        const current = this.selectedNodeData();
        const all = this.allNodes();
        if (!current) return [];
        return current.connectedTo.map(targetId => {
            const target = all.find(n => n.id === targetId);
            return target ? { id: targetId, label: target.label } : { id: targetId, label: 'Unknown' };
        });
    });

    constructor() {
        // Sync Selected Node to Form
        effect(() => {
            const node = this.selectedNodeData();
            if (node) {
                this.formLabel = node.label;
                this.formDesc = node.description;
                this.formColor = node.color;
                this.formX = Number(node.position.x.toFixed(2));
                this.formY = Number(node.position.y.toFixed(2));
                this.formZ = Number(node.position.z.toFixed(2));
                this.selectedTargetId = '';
            }
        });
    }

    onFormChange(): void {
        const node = this.selectedNodeData();
        if (!node) return;

        this.vizService.updateNode(node.id, {
            label: this.formLabel,
            description: this.formDesc,
            color: this.formColor,
            position: { x: this.formX, y: this.formY, z: this.formZ }
        });
    }

    deleteSelected(): void {
        const node = this.selectedNodeData();
        if (node) {
            this.vizService.deleteNode(node.id);
        }
    }

    addConnection(): void {
        const current = this.selectedNodeData();
        if (current && this.selectedTargetId) {
            this.vizService.connectNodes(current.id, this.selectedTargetId);
            this.selectedTargetId = '';
        }
    }

    removeConnection(targetId: string): void {
        const current = this.selectedNodeData();
        if (current) {
            this.vizService.disconnectNodes(current.id, targetId);
        }
    }
}
