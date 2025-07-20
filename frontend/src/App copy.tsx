import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Settings, Trash2, Play, Save, Terminal, Users, User, Link as LinkIcon, X, AlertCircle, CheckCircle } from 'lucide-react';
import { MCPToolNode } from './components/MCPToolNode';

interface Position {
  x: number;
  y: number;
}

interface ContextMenu {
  x: number;
  y: number;
  agent: Agent;
}

interface Notification {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface AgentNodeProps {
  agent: Agent;
  selected: boolean;
  onSelect: (agent: Agent) => void;
  onRightClick: (e: React.MouseEvent, agent: Agent) => void;
  onPositionChange: (agentId: string, position: Position) => void;
}



interface CanvasProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  onRightClick: (e: React.MouseEvent, agent: Agent) => void;
  onPositionChange: (agentId: string, position: Position) => void;
}

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const API_BASE_URL = 'http://localhost:8000/api';

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

interface WebSocketHookResult {
  logs: LogEntry[];
  isConnected: boolean;
}

// WebSocket for logs
const useWebSocket = (url: string): WebSocketHookResult => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000;
  const CONNECTION_TIMEOUT = 5000; // 5 seconds connection timeout

  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = undefined;
    }
  }, []);

  const resetConnection = useCallback(() => {
    clearTimeouts();
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      
      // Remove all event listeners before closing
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      
      // Only close if not already closed
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        try {
          ws.close();
        } catch (err) {
          console.error('Error closing WebSocket:', err);
        }
      }
    }
  }, [clearTimeouts]);

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    try {
      resetConnection();

      // Don't try to reconnect if we've exceeded the maximum attempts
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('Max reconnection attempts reached');
        return;
      }

      console.log(`Attempting connection to ${url}`);
      const ws = new WebSocket(url);
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      wsRef.current = ws;

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws === wsRef.current && ws.readyState === WebSocket.CONNECTING) {
          console.warn('Connection timeout - closing connection');
          ws.close();
        }
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        if (ws === wsRef.current && mountedRef.current) {
          console.log('WebSocket connection established');
          clearTimeouts();
          setIsConnected(true);
          reconnectAttemptsRef.current = 0; // Reset reconnection attempts on successful connection
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (ws === wsRef.current && mountedRef.current) {
          try {
            const log = JSON.parse(event.data) as LogEntry;
            setLogs(prev => [...prev, log].slice(-100)); // Keep last 100 logs
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        }
      };

      ws.onclose = (event) => {
        if (ws === wsRef.current) {
          console.log('WebSocket closed:', event.code, event.reason);
          setIsConnected(false);
          wsRef.current = null;
          
          // Clear the connection timeout if it exists
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = undefined;
          }
          
          // Only attempt to reconnect if we haven't started a new connection
          if (!reconnectTimeoutRef.current) {
            const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current), 10000);
            reconnectAttemptsRef.current++;
            
            console.log(`Scheduling reconnection attempt ${reconnectAttemptsRef.current} in ${delay}ms`);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = undefined;
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                console.log(`Attempting reconnection ${reconnectAttemptsRef.current} of ${MAX_RECONNECT_ATTEMPTS}`);
                connect();
              } else {
                console.warn('Maximum reconnection attempts reached - giving up');
              }
            }, delay);
          }
        }
      };

      ws.onerror = (error) => {
        if (ws === wsRef.current) {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        }
      };
    } catch (error) {
      setIsConnected(false);
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = undefined;
          connect();
        }, 3000);
      }
    }
  }, [url, clearTimeouts, resetConnection]);

  // Reset connection state when URL changes
  useEffect(() => {
    mountedRef.current = true;
    console.log('Setting up WebSocket connection');
    reconnectAttemptsRef.current = 0;
    
    // Small delay before initial connection to ensure clean setup
    const initTimeout = setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, 100);
    
    return () => {
      console.log('Cleaning up WebSocket connection');
      mountedRef.current = false;
      clearTimeout(initTimeout);
      resetConnection();
    };
  }, [connect, resetConnection]);

  return { logs, isConnected };
};

interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface MCPTool {
  id: string;
  name: string;
  package_name: string;
  description: string;
  env_variables: string[];
}

interface MCPAssociation {
  association_id: string;
  mcp_tool: MCPTool;
  env_values: Record<string, string>;
}

interface Agent {
  agent_id: string;
  name: string;
  instruction: string;
  model_name: string;
  agent_type: 'single' | 'orchestrator' | 'worker';
  usecase_id: string;
  position_x: number;
  position_y: number;
  mcp_tools?: MCPAssociation[];
}

// API Helper
const api = {
  async fetch(endpoint: string, options: ApiOptions = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      console.error('API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      
      let errorMessage: string;
      if (errorData) {
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData === 'object') {
          errorMessage = JSON.stringify(errorData, null, 2);
        } else {
          errorMessage = 'Unknown error occurred';
        }
      } else {
        errorMessage = response.statusText || 'Unknown error occurred';
      }
      
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).errorData = errorData;
      throw error;
    }
    
    return response.json();
  },
  
  // MCP Tools
  getMCPTools: (): Promise<MCPTool[]> => api.fetch('/mcp-tools'),
  createMCPTool: (data: Partial<MCPTool>) => api.fetch('/mcp-tools', { method: 'POST', body: JSON.stringify(data) }),
  deleteMCPTool: (id: string) => api.fetch(`/mcp-tools/${id}`, { method: 'DELETE' }),
  
  // Agents
  getAgents: (): Promise<Agent[]> => api.fetch('/agents'),
  createAgent: (data: Partial<Agent>) => api.fetch('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: Partial<Agent>) => api.fetch(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => api.fetch(`/agents/${id}`, { method: 'DELETE' }),
  
  // Agent-MCP Association
  addMCPToAgent: (agentId: string, data: { mcp_tool_id: string; env_values: Record<string, string> }) => 
    api.fetch(`/agents/${agentId}/mcp-tools`, { method: 'POST', body: JSON.stringify(data) }),
  removeMCPFromAgent: (agentId: string, associationId: string) => 
    api.fetch(`/agents/${agentId}/mcp-tools/${associationId}`, { method: 'DELETE' }),
  
  // Deployment
  deployAgent: (data: { agent_id: string }) => api.fetch('/deployments', { method: 'POST', body: JSON.stringify(data) }),
};

// Agent Node Component
const AgentNode: React.FC<AgentNodeProps> = ({ agent, selected, onSelect, onRightClick, onPositionChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setDragOffset({
        x: e.clientX - agent.position_x,
        y: e.clientY - agent.position_y
      });
      setIsDragging(true);
      onSelect(agent);
    }
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      onPositionChange(agent.agent_id, {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  }, [isDragging, agent.agent_id, dragOffset, onPositionChange]);
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset, handleMouseMove]);
  
  const iconMap = {
    single: User,
    orchestrator: Users,
    worker: User
  };
  
  const Icon = iconMap[agent.agent_type] || User;
  
  return (
    <g
      transform={`translate(${agent.position_x}, ${agent.position_y})`}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick(e, agent);
      }}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <rect
        x="-60"
        y="-40"
        width="120"
        height="80"
        rx="8"
        fill={selected ? '#3b82f6' : '#1e293b'}
        stroke={selected ? '#60a5fa' : '#475569'}
        strokeWidth="2"
      />
      <foreignObject x="-60" y="-40" width="120" height="80">
        <div className="flex flex-col items-center justify-center h-full text-white p-2">
          <Icon size={24} className="mb-1" />
          <div className="text-xs font-medium text-center truncate w-full">
            {agent.name}
          </div>
          <div className="text-[10px] opacity-75">
            {agent.agent_type}
          </div>
        </div>
      </foreignObject>
      
      {/* Remove MCP tool indicators since they'll be separate nodes */}
    </g>
  );
};

  // Canvas Component
const Canvas: React.FC<CanvasProps> = ({ agents, selectedAgent, onSelectAgent, onRightClick, onPositionChange }) => {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [selectedMCPTool, setSelectedMCPTool] = useState<MCPAssociation | null>(null);

  // Calculate center of viewport on mount
  useEffect(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const center = {
        x: Math.floor(rect.width / 2),
        y: Math.floor(rect.height / 2)
      };
      console.log('Canvas dimensions:', rect);
      console.log('Calculated center:', center);
      window.localStorage.setItem('canvasCenter', JSON.stringify(center));
    }
  }, []);

  return (
    <svg className="w-full h-full" ref={canvasRef}>
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#111827" />
      <rect width="100%" height="100%" fill="url(#grid)" />      {agents.map(agent => (
        <AgentNode
          key={agent.agent_id}
          agent={agent}
          selected={selectedAgent?.agent_id === agent.agent_id}
          onSelect={onSelectAgent}
          onRightClick={onRightClick}
          onPositionChange={onPositionChange}
        />
      ))}
    </svg>
  );
};

// Side Panel Component
const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-900 shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded"
        >
          <X size={20} className="text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
};

// Main App Component
export default function AgentPlatform() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mcpTools, setMCPTools] = useState<MCPTool[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAgentPanel, setShowAgentPanel] = useState<boolean>(false);
  const [showMCPPanel, setShowMCPPanel] = useState<boolean>(false);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showLogsPanel, setShowLogsPanel] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  const { logs, isConnected } = useWebSocket('ws://localhost:8000/ws/logs/main-client');
  
  // Form states
  interface AgentFormData extends Omit<Agent, 'agent_id' | 'position_x' | 'position_y' | 'mcp_tools'> {
    api_key: string;
    consumer_key: string;
    consumer_secret: string;
  }

  const [agentForm, setAgentForm] = useState<AgentFormData>({
    name: '',
    instruction: '',
    model_name: 'gpt-4',
    agent_type: 'single',
    usecase_id: '',
    api_key: '',
    consumer_key: '',
    consumer_secret: ''
  });
  
  interface MCPFormData {
    name: string;
    package_name: string;
    description: string;
    env_variables: string[];
  }

  const [mcpForm, setMCPForm] = useState<MCPFormData>({
    name: '',
    package_name: '',
    description: '',
    env_variables: []
  });
  
  interface MCPAssociationFormData {
    selectedTool: MCPTool | null;
    envValues: Record<string, string>;
  }

  const [mcpAssociationForm, setMCPAssociationForm] = useState<MCPAssociationFormData>({
    selectedTool: null,
    envValues: {}
  });
  
  // Load data functions
  const loadAgents = useCallback(async () => {
    try {
      const data = await api.getAgents();
      setAgents(data);
    } catch (error) {
      showNotification('Error loading agents', 'error');
    }
  }, []);
  
  const loadMCPTools = useCallback(async () => {
    try {
      const data = await api.getMCPTools();
      setMCPTools(data);
    } catch (error) {
      showNotification('Error loading MCP tools', 'error');
    }
  }, []);

  // Load data on component mount
  useEffect(() => {
    loadAgents();
    loadMCPTools();
  }, [loadAgents, loadMCPTools]);
  
  const showNotification = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  
  // Agent operations
  const createAgent = async () => {
    try {
      // Get stored canvas center coordinates
      const centerStr = window.localStorage.getItem('canvasCenter');
      const center = centerStr ? JSON.parse(centerStr) : { x: 500, y: 300 };
      
      // Add center coordinates to agent form data
      const formData = {
        ...agentForm,
        position_x: center.x,
        position_y: center.y
      };
      
      await api.createAgent(formData);
      showNotification('Agent created successfully', 'success');
      loadAgents();
      setShowAgentPanel(false);
      setAgentForm({
        name: '',
        instruction: '',
        model_name: 'gpt-4',
        agent_type: 'single',
        usecase_id: '',
        api_key: '',
        consumer_key: '',
        consumer_secret: ''
      });
    } catch (error) {
      showNotification('Error creating agent', 'error');
    }
  };
  
  const deleteAgent = async (agentId: string) => {
    try {
      await api.deleteAgent(agentId);
      showNotification('Agent deleted successfully', 'success');
      loadAgents();
      setSelectedAgent(null);
    } catch (error) {
      showNotification('Error deleting agent', 'error');
    }
  };
  
  const updateAgentPosition = async (agentId: string, position: Position) => {
    setAgents(prev => prev.map(agent => 
      agent.agent_id === agentId 
        ? { ...agent, position_x: position.x, position_y: position.y }
        : agent
    ));
  };

  // MCP operations
  const createMCPTool = async () => {
    try {
      await api.createMCPTool(mcpForm);
      showNotification('MCP tool created successfully', 'success');
      loadMCPTools();
      setMCPForm({
        name: '',
        package_name: '',
        description: '',
        env_variables: []
      });
    } catch (error) {
      showNotification('Error creating MCP tool', 'error');
    }
  };
  
  const addMCPToAgent = async () => {
    if (!selectedAgent || !mcpAssociationForm.selectedTool) {
      showNotification('Please select an agent and a tool', 'error');
      return;
    }
    
    // Validate that all required env variables have values
    const missingEnvVars = mcpAssociationForm.selectedTool.env_variables.filter(
      envVar => !mcpAssociationForm.envValues[envVar]
    );
    
    if (missingEnvVars.length > 0) {
      showNotification(`Missing required environment variables: ${missingEnvVars.join(', ')}`, 'error');
      return;
    }

    // Clean up env_values to remove any undefined or null values
    const cleanedEnvValues = Object.fromEntries(
      Object.entries(mcpAssociationForm.envValues)
        .filter(([_, value]) => value !== null && value !== undefined && value !== '')
    );

    const payload = {
      mcp_tool_id: mcpAssociationForm.selectedTool.id,
      env_values: cleanedEnvValues
    };
    
    try {
      console.log('Adding MCP tool with payload:', JSON.stringify(payload, null, 2));
      await api.addMCPToAgent(selectedAgent.agent_id, payload);
      showNotification('MCP tool added to agent', 'success');
      loadAgents();
      setShowMCPPanel(false);
      setMCPAssociationForm({ selectedTool: null, envValues: {} });
    } catch (error: any) {
      console.error('Error adding MCP tool:', error);
      
      let errorMessage = 'Failed to add MCP tool';
      if (error.errorData) {
        if (Array.isArray(error.errorData.detail)) {
          errorMessage += `: ${error.errorData.detail.join(', ')}`;
        } else if (error.errorData.detail) {
          errorMessage += `: ${error.errorData.detail}`;
        } else if (error.message && error.message !== '[object Object]') {
          errorMessage += `: ${error.message}`;
        }
      }
      
      showNotification(errorMessage, 'error');
      
      // If we got validation errors, keep the panel open
      if (error.status === 422) {
        return;
      }
      
      // For other errors, close the panel
      setShowMCPPanel(false);
    }
  };
  
  const deployAgent = async (agentId: string) => {
    try {
      const result = await api.deployAgent({ agent_id: agentId });
      showNotification(`Deployment started: ${result.deployment_id}`, 'success');
    } catch (error) {
      showNotification('Error deploying agent', 'error');
    }
  };
  
  // Context menu
  const handleRightClick = (e: React.MouseEvent, agent: Agent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      agent
    });
  };  const closeContextMenu = () => {
    setContextMenu(null);
  };
  
  useEffect(() => {
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, []);
  
  return (
    <div className="h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Agent Authoring Platform</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAgentPanel(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={16} />
            Single Agent
          </button>
          <button
            onClick={() => setShowAdminPanel(true)}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 flex items-center gap-2"
          >
            <Settings size={16} />
            Admin
          </button>
          <button
            onClick={() => setShowLogsPanel(!showLogsPanel)}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 flex items-center gap-2"
          >
            <Terminal size={16} />
            Logs
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 relative">
        <Canvas
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
          onRightClick={handleRightClick}
          onPositionChange={updateAgentPosition}
        />
        
        {/* Context Menu */}
        {contextMenu && (
          <div
            className="absolute bg-gray-800 rounded shadow-lg py-2 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                setSelectedAgent(contextMenu.agent);
                setShowMCPPanel(true);
                closeContextMenu();
              }}
              className="px-4 py-2 text-white hover:bg-gray-700 w-full text-left flex items-center gap-2"
            >
              <LinkIcon size={16} />
              Add Tool
            </button>
            <button
              onClick={() => {
                deployAgent(contextMenu.agent.agent_id);
                closeContextMenu();
              }}
              className="px-4 py-2 text-white hover:bg-gray-700 w-full text-left flex items-center gap-2"
            >
              <Play size={16} />
              Deploy
            </button>
            <button
              onClick={() => {
                deleteAgent(contextMenu.agent.agent_id);
                closeContextMenu();
              }}
              className="px-4 py-2 text-white hover:bg-gray-700 w-full text-left flex items-center gap-2"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </div>
      
      {/* Agent Creation Panel */}
      <SidePanel
        isOpen={showAgentPanel}
        onClose={() => setShowAgentPanel(false)}
        title="Create Agent"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Agent Name
            </label>
            <input
              type="text"
              value={agentForm.name}
              onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              placeholder="My Agent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              System Instruction
            </label>
            <textarea
              value={agentForm.instruction}
              onChange={(e) => setAgentForm({ ...agentForm, instruction: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white h-32"
              placeholder="You are a helpful assistant..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Model
            </label>
            <select
              value={agentForm.model_name}
              onChange={(e) => setAgentForm({ ...agentForm, model_name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="claude-3">Claude 3</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Usecase ID
            </label>
            <input
              type="text"
              value={agentForm.usecase_id}
              onChange={(e) => setAgentForm({ ...agentForm, usecase_id: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={agentForm.api_key}
              onChange={(e) => setAgentForm({ ...agentForm, api_key: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Consumer Key
            </label>
            <input
              type="text"
              value={agentForm.consumer_key}
              onChange={(e) => setAgentForm({ ...agentForm, consumer_key: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Consumer Secret
            </label>
            <input
              type="password"
              value={agentForm.consumer_secret}
              onChange={(e) => setAgentForm({ ...agentForm, consumer_secret: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            />
          </div>
          
          <button
            onClick={createAgent}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Save size={16} />
            Create Agent
          </button>
        </div>
      </SidePanel>
      
      {/* MCP Association Panel */}
      <SidePanel
        isOpen={showMCPPanel}
        onClose={() => setShowMCPPanel(false)}
        title="Add MCP Tool"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select MCP Tool
            </label>
            <div className="space-y-2">
              {mcpTools.map(tool => (
                <div
                  key={tool.id}
                  onClick={() => setMCPAssociationForm({ 
                    selectedTool: tool, 
                    envValues: {} 
                  })}
                  className={`p-3 rounded cursor-pointer border ${
                    mcpAssociationForm.selectedTool?.id === tool.id
                      ? 'bg-blue-900 border-blue-600'
                      : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium text-white">{tool.name}</div>
                  <div className="text-sm text-gray-400">{tool.description}</div>
                </div>
              ))}
            </div>
          </div>
          
          {mcpAssociationForm.selectedTool && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-300">
                Environment Variables for {mcpAssociationForm.selectedTool.name}
              </h3>
              {mcpAssociationForm.selectedTool.env_variables.map(envVar => (
                <div key={envVar}>
                  <label className="block text-sm text-gray-400 mb-1">
                    {envVar}
                  </label>
                  <input
                    type="text"
                    value={mcpAssociationForm.envValues[envVar] || ''}
                    onChange={(e) => setMCPAssociationForm({
                      ...mcpAssociationForm,
                      envValues: {
                        ...mcpAssociationForm.envValues,
                        [envVar]: e.target.value
                      }
                    })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  />
                </div>
              ))}
              
              <button
                onClick={addMCPToAgent}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Add Tool to Agent
              </button>
            </div>
          )}
        </div>
      </SidePanel>
      
      {/* Admin Panel */}
      <SidePanel
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        title="Admin - MCP Tools"
      >
        <div className="space-y-4">
          <div className="border border-gray-700 rounded p-4">
            <h3 className="text-lg font-medium text-white mb-3">Add New MCP Tool</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tool Name
                </label>
                <input
                  type="text"
                  value={mcpForm.name}
                  onChange={(e) => setMCPForm({ ...mcpForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="My MCP Tool"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Package Name
                </label>
                <input
                  type="text"
                  value={mcpForm.package_name}
                  onChange={(e) => setMCPForm({ ...mcpForm, package_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="mcp-tool-package"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={mcpForm.description}
                  onChange={(e) => setMCPForm({ ...mcpForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="Tool description..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Environment Variables (comma-separated)
                </label>
                <input
                  type="text"
                  value={mcpForm.env_variables.join(', ')}
                  onChange={(e) => setMCPForm({ 
                    ...mcpForm, 
                    env_variables: e.target.value.split(',').map(v => v.trim()).filter(v => v)
                  })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="API_KEY, SECRET_KEY, BASE_URL"
                />
              </div>
              
              <button
                onClick={createMCPTool}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create MCP Tool
              </button>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium text-white mb-3">Existing MCP Tools</h3>
            <div className="space-y-2">
              {mcpTools.map(tool => (
                <div key={tool.id} className="bg-gray-800 p-3 rounded border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{tool.name}</div>
                      <div className="text-sm text-gray-400">{tool.package_name}</div>
                    </div>
                    <button
                      onClick={() => api.deleteMCPTool(tool.id).then(loadMCPTools)}
                      className="p-1 hover:bg-gray-700 rounded"
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>
      
      {/* Logs Panel */}
      {showLogsPanel && (
        <div className="fixed bottom-0 left-0 right-0 h-64 bg-gray-900 border-t border-gray-800">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-2 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">Logs</h3>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-400">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button
                onClick={() => setShowLogsPanel(false)}
                className="p-1 hover:bg-gray-800 rounded"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${
                    log.level === 'error' ? 'text-red-400' : 
                    log.level === 'warning' ? 'text-yellow-400' : 
                    'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {' '}
                  <span className={`font-bold ${
                    log.level === 'error' ? 'text-red-500' : 
                    log.level === 'warning' ? 'text-yellow-500' : 
                    'text-blue-500'
                  }`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  {' '}
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded shadow-lg flex items-center gap-2 ${
          notification.type === 'error' ? 'bg-red-600' : 
          notification.type === 'success' ? 'bg-green-600' : 
          'bg-blue-600'
        } text-white`}>
          {notification.type === 'error' ? <AlertCircle size={20} /> :
           notification.type === 'success' ? <CheckCircle size={20} /> :
           <AlertCircle size={20} />}
          {notification.message}
        </div>
      )}
    </div>
  );
}