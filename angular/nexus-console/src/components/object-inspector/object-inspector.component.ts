import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
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
    private cdr = inject(ChangeDetectorRef);

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

    // Default direction is bidirectional (per architect direction 2026-07-27):
    // one-way communication is currently rare, so bidirectional is the sensible default.
    newConnectionDirection: 'out' | 'in' | 'bidirectional' = 'bidirectional';

    // Computed list of nodes we can connect to (excludes already-connected in either direction)
    availableTargets = computed(() => {
        const current = this.selectedNodeData();
        const all = this.allNodes();
        if (!current) return [];

        const config = this.registry.getConfig(current.type);

        // Build a set of nodes already connected in either direction
        const connectedIds = new Set<string>(current.connectedTo);
        // Also exclude nodes that point TO current (inbound)
        for (const n of all) {
            if (n.connectedTo.includes(current.id)) {
                connectedIds.add(n.id);
            }
        }

        return all.filter(n => {
            if (n.id === current.id) return false;
            if (connectedIds.has(n.id)) return false;
            if (config.allowedConnections && config.allowedConnections !== 'all' && !config.allowedConnections.includes(n.type)) return false;
            return true;
        }).sort((a, b) => a.label.localeCompare(b.label));
    });

    /** All connections involving the selected node (outbound, inbound, bidirectional).
     *  Each entry includes the direction relative to the selected node. */
    allConnections = computed(() => {
        const current = this.selectedNodeData();
        const all = this.allNodes();
        if (!current) return [];

        const result: { nodeId: string; label: string; direction: 'out' | 'in' | 'bidirectional' }[] = [];
        const seen = new Set<string>();

        // Outbound + bidirectional from current
        for (const targetId of current.connectedTo) {
            const key = [current.id, targetId].sort().join('::');
            if (seen.has(key)) continue;
            seen.add(key);
            const target = all.find(n => n.id === targetId);
            const bidir = this.vizService.isBidirectional(current.id, targetId);
            result.push({
                nodeId: targetId,
                label: target?.label ?? targetId,
                direction: bidir ? 'bidirectional' : 'out'
            });
        }

        // Incoming (other nodes point to current, not already covered)
        for (const n of all) {
            if (n.id === current.id) continue;
            if (n.connectedTo.includes(current.id)) {
                const key = [current.id, n.id].sort().join('::');
                if (seen.has(key)) continue;
                seen.add(key);
                result.push({
                    nodeId: n.id,
                    label: n.label,
                    direction: 'in'
                });
            }
        }
        return result;
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
                this.cdr.markForCheck();
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
        if (!current || !this.selectedTargetId) return;
        this.vizService.snapshotForUndo();

        let fromId: string, toId: string;
        if (this.newConnectionDirection === 'in') {
            fromId = this.selectedTargetId;
            toId = current.id;
        } else {
            fromId = current.id;
            toId = this.selectedTargetId;
        }

        this.vizService.connectNodes(fromId, toId);
        if (this.newConnectionDirection === 'bidirectional') {
            this.vizService.toggleConnectionDirection(fromId, toId);
        }
        this.selectedTargetId = '';
    }

    removeConnection(targetId: string): void {
        const current = this.selectedNodeData();
        if (!current) return;
        this.vizService.snapshotForUndo();
        // If this is an inbound connection (targetId has current in its connectedTo),
        // disconnect from their side so the visual line is properly removed
        const targetNode = this.vizService.getNode(targetId);
        if (targetNode?.connectedTo.includes(current.id)) {
            this.vizService.disconnectNodes(targetId, current.id);
        } else {
            this.vizService.disconnectNodes(current.id, targetId);
        }
    }

    /** Cycle a connection's direction through 3 states: bidirectional → out → in → bidirectional.
     *  Bidirectional is the default. The direction parameter indicates the CURRENT direction
     *  relative to the selected node (for badge display). The cycle is handled by the viz service. */
    toggleConnectionDirection(targetId: string, direction: 'out' | 'in' | 'bidirectional'): void {
        const current = this.selectedNodeData();
        if (!current) return;
        this.vizService.snapshotForUndo();

        // Use the 3-state cycle: cycleConnectionDirection takes the "current"
        // node as fromId and the "other" node as toId, and figures out the
        // current state internally.
        this.vizService.cycleConnectionDirection(current.id, targetId);
        // Force inspector refresh so the direction badge updates
        this.vizService.selectNode(current.id);
    }
}
