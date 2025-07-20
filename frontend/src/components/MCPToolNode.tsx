import React from 'react';
import { MCPAssociation, Agent } from '../types';

interface MCPToolNodeProps {
  tool: MCPAssociation;
  agent: Agent;
  selected: boolean;
  onSelect: (tool: MCPAssociation) => void;
}

export const MCPToolNode: React.FC<MCPToolNodeProps> = ({ tool, agent, selected, onSelect }) => {
  // Calculate position: offset from the agent's position
  const toolPosition = {
    x: agent.position_x + 200, // 200px to the right of the agent
    y: agent.position_y
  };

  return (
    <g
      transform={`translate(${toolPosition.x}, ${toolPosition.y})`}
      onClick={() => onSelect(tool)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x="-50"
        y="-30"
        width="100"
        height="60"
        rx="8"
        fill={selected ? '#047857' : '#065f46'}
        stroke={selected ? '#34d399' : '#059669'}
        strokeWidth="2"
      />
      <foreignObject x="-50" y="-30" width="100" height="60">
        <div className="flex flex-col items-center justify-center h-full text-white p-2">
          <div className="text-xs font-medium text-center truncate w-full">
            {tool.mcp_tool.name}
          </div>
          <div className="text-[10px] opacity-75">
            MCP Tool
          </div>
        </div>
      </foreignObject>
    </g>
  );
};
