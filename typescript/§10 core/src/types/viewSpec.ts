import { CapabilityId, PriorityLevel, HierarchySetting, DensitySetting } from "./designIR";
import { CapabilityContract, SurfaceContextContract } from "./capabilities";

export interface Widget {
  id: string;
  type: string;
  props?: Record<string, any>;
  contract: CapabilityId;
}

export interface WidgetInstance {
  id: string;
  contract: CapabilityContract;
  widget: Widget;
  role?: string;
}

export interface LayoutSpec {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  flex?: number;
  order?: number;
}

export interface LayoutNode {
  id: string;
  widgetId: string;
  region: "main" | "sidebar" | "footer" | "header" | "overlay";
  layout: LayoutSpec;
  priority?: PriorityLevel;
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  hierarchy?: HierarchySetting;
  density?: DensitySetting;
}

export type PayloadSourceType = "rest" | "sse" | "mock" | "file" | "agent";

export interface PayloadSource {
  type: PayloadSourceType;
  url?: string;
  mock?: any;
  agentId?: string;
}

export interface AdapterBinding {
  widgetId: string;
  adapterId: string;
  source: PayloadSource;
  outputContract: CapabilityId;
}

export type ViewSpecAction =
  | { type: "navigate"; target: string }
  | { type: "inspect"; widgetId: string }
  | { type: "drilldown"; widgetId: string }
  | { type: "filter"; widgetId: string; filter: Record<string, any> }
  | { type: "sort"; widgetId: string; sort: { key: string; direction: "asc" | "desc" } }
  | { type: "acknowledge"; widgetId: string }
  | { type: "dismiss"; widgetId: string }
  | { type: "compare"; widgetId: string; targetId: string };

export interface EventRoute {
  fromWidget: string;
  event: string;
  action: ViewSpecAction;
}

export interface EventRoutingMatrix {
  routes: EventRoute[];
  defaultAction?: ViewSpecAction;
}

export interface FixtureOverrides {
  [widgetId: string]: {
    data: any;
    scenario: "nominal" | "empty" | "overflow" | "fuzz";
  };
}

export interface ViewSpec {
  id: string;
  layout: LayoutGraph;
  widgets: WidgetInstance[];
  adapters: AdapterBinding[];
  events: EventRoute[];
  fixtures?: FixtureOverrides;
  context?: SurfaceContextContract;
  name?: string;
}
