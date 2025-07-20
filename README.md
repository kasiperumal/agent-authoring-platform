# Agent Authoring Platform - Setup Guide

## Overview

This no-code agent authoring platform enables both technical and non-technical users to create, configure, and deploy AI agents with MCP (Model Context Protocol) tools. The platform supports:

- **Single Agent**: Using Google ADK (Agent Development Kit)
- **Multi-Agent**: Using A2A (Agent-to-Agent) protocol with orchestrator pattern

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────┐ │
│  │ Canvas  │  │ Sidepanel│  │  Admin  │  │   Logs Panel │ │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────┐ │
│  │  APIs   │  │ Database │  │Deployer │  │  WebSocket   │ │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Deployed Agents                           │
│  ┌─────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │Single Agent │  │  Orchestrator  │  │ Worker Agents  │  │
│  │   (ADK)    │  │     (A2A)      │  │     (A2A)      │  │
│  └─────────────┘  └────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn
- SQLite (included with Python)

### Backend Setup

1. **Clone the repository and navigate to backend directory:**
```bash
mkdir agent-platform
cd agent-platform
mkdir backend frontend
```

2. **Create virtual environment:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install fastapi uvicorn sqlalchemy pydantic aiohttp websockets python-multipart
```

4. **Save the backend code (main.py) from the first artifact**

5. **Save the deployment scripts (deployment_manager.py) from the third artifact**

6. **Start the backend server:**
```bash
python main.py
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory:**
```bash
cd ../frontend
```

2. **Initialize React project:**
```bash
npx create-react-app . --template typescript
```

3. **Install additional dependencies:**
```bash
npm install @mui/material @emotion/react @emotion/styled lucide-react axios
```

4. **Replace src/App.tsx with the React code from the second artifact**

5. **Update src/index.css:**
```css
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

6. **Start the frontend:**
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Usage Guide

### Admin Flow - Adding MCP Tools

1. Click the **Admin** button in the header
2. In the Admin panel, fill in:
   - **Tool Name**: Display name for the MCP tool
   - **Package Name**: Python package name (e.g., `mcp-email-tool`)
   - **Description**: Brief description of the tool's functionality
   - **Environment Variables**: Comma-separated list (e.g., `API_KEY, BASE_URL, SECRET`)
3. Click **Create MCP Tool**

### End-User Flow - Creating Single Agent

1. **Create Agent:**
   - Click **Single Agent** button
   - An agent node appears on the canvas
   - Click the agent node to open configuration panel
   - Fill in:
     - Agent Name
     - System Instruction (prompt)
     - Model (GPT-4, GPT-3.5, Claude-3)
     - Environment variables (Usecase ID, API Key, etc.)
   - Click **Save**

2. **Add MCP Tools:**
   - Right-click the agent node
   - Select **Add Tool**
   - Choose from available MCP tools
   - Fill in tool-specific environment variables
   - Click **Add Tool to Agent**
   - Repeat for additional tools

3. **Deploy Agent:**
   - Right-click the agent node
   - Select **Deploy**
   - Monitor deployment progress in the Logs panel
   - Once deployed, access Chat UI at `http://localhost:8100`

### Multi-Agent Architecture

1. **Create Orchestrator:**
   - Create an agent with type "orchestrator"
   - Configure without MCP tools (orchestrator doesn't use tools directly)

2. **Create Worker Agents:**
   - Create multiple agents with type "worker"
   - Add appropriate MCP tools to each worker
   - Position agents on canvas to visualize architecture

3. **Deploy Multi-Agent System:**
   - Deploy orchestrator first
   - Deploy each worker agent
   - A2A coordinator automatically manages communication

## Environment Variables

### Pre-defined Static Variables (automatically set):
- `BASE_URL`: API base URL
- `CERTS_PATH`: Path to certificates
- `APIGEE_URL`: Apigee gateway URL
- `USE_API_GATEWAY`: Boolean flag

### User-provided Variables:
- `USECASE_ID`: Unique identifier for use case
- `API_KEY`: API authentication key
- `CONSUMER_KEY`: OAuth consumer key
- `CONSUMER_SECRET`: OAuth consumer secret

### MCP Tool Variables:
Each MCP tool can define its own required environment variables

## API Endpoints

### MCP Tools
- `GET /api/mcp-tools` - List all MCP tools
- `POST /api/mcp-tools` - Create new MCP tool
- `DELETE /api/mcp-tools/{id}` - Delete MCP tool

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create new agent
- `PUT /api/agents/{id}` - Update agent
- `DELETE /api/agents/{id}` - Delete agent

### Agent-MCP Association
- `POST /api/agents/{id}/mcp-tools` - Add MCP tool to agent
- `DELETE /api/agents/{id}/mcp-tools/{assoc_id}` - Remove MCP tool

### Deployment
- `POST /api/deployments` - Deploy agent
- `GET /api/deployments/{id}` - Get deployment status

### WebSocket
- `WS /ws/logs/{client_id}` - Real-time logs streaming

## Deployment Structure

```
deployments/
├── {deployment-id}/
│   ├── venv/               # Python virtual environment
│   ├── agent.py           # Generated agent script
│   ├── start.sh           # Start script
│   └── logs/              # Agent logs
```

## Extending the Platform

### Adding New MCP Tools

1. Create Python package for the MCP tool
2. Define required environment variables
3. Add tool through Admin panel
4. Tool becomes available for all agents

### Custom Agent Types

Extend the `agent_type` field to support:
- Specialized agents (analyzer, validator, etc.)
- Different orchestration patterns
- Custom deployment strategies

### Remote Deployment

Configure remote hosts through the Admin panel:
- SSH credentials
- Target directories
- Port assignments
- Health monitoring

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   - Single agents: Default 8100
   - Orchestrator: Default 8200
   - Workers: Dynamic 8300-8399
   - A2A Coordinator: Default 8400

2. **MCP Tool import failures:**
   - Check package name spelling
   - Verify package is available in PyPI
   - Check virtual environment activation

3. **WebSocket connection issues:**
   - Ensure CORS is properly configured
   - Check WebSocket URL matches backend

### Logs

- **Backend logs:** Console output from FastAPI
- **Agent logs:** Available in deployment directory
- **Frontend logs:** Browser developer console
- **Real-time logs:** Logs panel in UI

## Security Considerations

1. **Environment Variables:**
   - Store sensitive data securely
   - Use environment-specific configurations
   - Implement proper key rotation

2. **API Security:**
   - Add authentication middleware
   - Implement rate limiting
   - Use HTTPS in production

3. **Agent Isolation:**
   - Run agents in containers
   - Implement resource limits
   - Monitor agent activities

## Production Deployment

### Backend
```bash
# Use production ASGI server
pip install gunicorn
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend
```bash
# Build production bundle
npm run build

# Serve with nginx or similar
# Copy build/ contents to web server
```

### Database
For production, consider migrating from SQLite to PostgreSQL:
```python
# Update database URL in main.py
SQLALCHEMY_DATABASE_URL = "postgresql://user:password@localhost/agentplatform"
```

## Future Enhancements

1. **Agent Templates:** Pre-configured agents for common use cases
2. **Visual Flow Editor:** Connect agents with visual workflows
3. **Monitoring Dashboard:** Real-time agent performance metrics
4. **Version Control:** Track agent configuration changes
5. **Collaborative Features:** Multi-user agent development
6. **Plugin System:** Extensible architecture for custom features

## Support

For issues and questions:
- Check the logs panel for real-time debugging
- Review API responses in browser developer tools
- Ensure all dependencies are properly installed
- Verify environment variables are correctly set

## License

[Add appropriate license information]

---

**Note:** This platform is designed for development and testing. Additional security measures should be implemented before production use.