// Agent Types
export interface Position {
  x: number;
  y: number;
}

export interface MCPTool {
  id: string;
  name: string;
  package_name: string;
  description: string;
  env_variables: string[];
}

export interface MCPAssociation {
  association_id: string;
  mcp_tool: MCPTool;
  env_values: Record<string, string>;
}

export interface Agent {
  agent_id: string;
  agent_type: 'single' | 'orchestrator' | 'worker';
  name: string;
  system_instruction: string;
  model: string;
  position_x: number;
  position_y: number;
  mcp_tools?: MCPAssociation[];
}

// Form Types
export interface MCPForm {
  name: string;
  package_name: string;
  description: string;
  env_variables: string[];
}

export interface MCPAssociationForm {
  selectedTool: MCPTool;
  envValues: Record<string, string>;
}

// Context Menu Type
export interface ContextMenu {
  x: number;
  y: number;
  agent: Agent;
}

// Notification Type
export interface Notification {
  message: string;
  type: 'error' | 'success' | 'info';
}

// Log Type
export interface Log {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

// Component Props Types
export interface AgentNodeProps {
  agent: Agent;
  selected: boolean;
  onSelect: (agent: Agent) => void;
  onRightClick: (e: React.MouseEvent, agent: Agent) => void;
  onPositionChange: (agentId: string, position: Position) => void;
}

export interface CanvasProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onRightClick: (e: React.MouseEvent, agent: Agent) => void;
  onPositionChange: (agentId: string, position: Position) => void;
}

export interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
