# main.py
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker, relationship
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import subprocess
import shutil
import uuid
from datetime import datetime
import asyncio
import logging
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./agent_platform.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class MCPTool(Base):
    __tablename__ = "mcp_tools"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    package_name = Column(String)
    description = Column(Text)
    env_variables = Column(JSON)  # List of required env var names
    created_at = Column(DateTime, default=datetime.utcnow)

class Agent(Base):
    __tablename__ = "agents"
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(String, unique=True, index=True)
    name = Column(String)
    instruction = Column(Text)
    model_name = Column(String)
    agent_type = Column(String)  # 'single' or 'orchestrator' or 'worker'
    usecase_id = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    consumer_key = Column(String, nullable=True)
    consumer_secret = Column(String, nullable=True)
    position_x = Column(Integer, default=960)  # Horizontal center (1920/2)
    position_y = Column(Integer, default=540)  # Vertical center (1080/2)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    mcp_associations = relationship("AgentMCPAssociation", back_populates="agent", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="agent", cascade="all, delete-orphan")

class AgentMCPAssociation(Base):
    __tablename__ = "agent_mcp_associations"
    
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"))
    mcp_tool_id = Column(Integer, ForeignKey("mcp_tools.id"))
    env_values = Column(JSON)  # Dict of env var name -> value
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    agent = relationship("Agent", back_populates="mcp_associations")
    mcp_tool = relationship("MCPTool")

class Deployment(Base):
    __tablename__ = "deployments"
    
    id = Column(Integer, primary_key=True, index=True)
    deployment_id = Column(String, unique=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"))
    deployment_type = Column(String)  # 'local' or 'remote'
    status = Column(String)  # 'deploying', 'running', 'stopped', 'error'
    deployment_path = Column(String)
    port = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    agent = relationship("Agent", back_populates="deployments")

class RemoteConfig(Base):
    __tablename__ = "remote_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    host = Column(String)
    port = Column(Integer)
    username = Column(String)
    ssh_key_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# FastAPI app
app = FastAPI(title="Agent Authoring Platform API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# WebSocket manager for logs
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_log(self, client_id: str, message: str, level: str = "info"):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json({
                "timestamp": datetime.utcnow().isoformat(),
                "level": level,
                "message": message
            })

manager = ConnectionManager()

# Pydantic Models
class MCPToolCreate(BaseModel):
    name: str
    package_name: str
    description: str
    env_variables: List[str]

class MCPToolResponse(BaseModel):
    id: int
    name: str
    package_name: str
    description: str
    env_variables: List[str]
    created_at: datetime

class AgentCreate(BaseModel):
    name: str
    instruction: str
    model_name: str
    agent_type: str = "single"
    usecase_id: Optional[str] = None
    api_key: Optional[str] = None
    consumer_key: Optional[str] = None
    consumer_secret: Optional[str] = None
    position_x: int = 960  # Horizontal center (1920/2)
    position_y: int = 540  # Vertical center (1080/2)

class AgentResponse(BaseModel):
    id: int
    agent_id: str
    name: str
    instruction: str
    model_name: str
    agent_type: str
    usecase_id: Optional[str]
    position_x: int
    position_y: int
    created_at: datetime
    mcp_tools: List[Dict[str, Any]] = []

class AgentMCPCreate(BaseModel):
    mcp_tool_id: int
    env_values: Dict[str, str]

class DeploymentCreate(BaseModel):
    agent_id: str
    deployment_type: str = "local"

class RemoteConfigCreate(BaseModel):
    name: str
    host: str
    port: int
    username: str
    ssh_key_path: Optional[str] = None

# API Endpoints

# MCP Tools Management
@app.post("/api/mcp-tools", response_model=MCPToolResponse)
def create_mcp_tool(tool: MCPToolCreate, db: Session = Depends(get_db)):
    db_tool = MCPTool(**tool.dict())
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool

@app.get("/api/mcp-tools", response_model=List[MCPToolResponse])
def list_mcp_tools(db: Session = Depends(get_db)):
    return db.query(MCPTool).all()

@app.get("/api/mcp-tools/{tool_id}", response_model=MCPToolResponse)
def get_mcp_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = db.query(MCPTool).filter(MCPTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="MCP tool not found")
    return tool

@app.delete("/api/mcp-tools/{tool_id}")
def delete_mcp_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = db.query(MCPTool).filter(MCPTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="MCP tool not found")
    db.delete(tool)
    db.commit()
    return {"message": "MCP tool deleted"}

# Agents Management
@app.post("/api/agents", response_model=AgentResponse)
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    agent_id = str(uuid.uuid4())
    db_agent = Agent(agent_id=agent_id, **agent.dict())
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    return db_agent

@app.get("/api/agents", response_model=List[AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).all()
    result = []
    for agent in agents:
        agent_dict = {
            "id": agent.id,
            "agent_id": agent.agent_id,
            "name": agent.name,
            "instruction": agent.instruction,
            "model_name": agent.model_name,
            "agent_type": agent.agent_type,
            "usecase_id": agent.usecase_id,
            "position_x": agent.position_x,
            "position_y": agent.position_y,
            "created_at": agent.created_at,
            "mcp_tools": []
        }
        
        for assoc in agent.mcp_associations:
            agent_dict["mcp_tools"].append({
                "association_id": assoc.id,
                "mcp_tool": {
                    "id": assoc.mcp_tool.id,
                    "name": assoc.mcp_tool.name,
                    "package_name": assoc.mcp_tool.package_name
                },
                "env_values": assoc.env_values
            })
        
        result.append(agent_dict)
    
    return result

@app.get("/api/agents/{agent_id}", response_model=AgentResponse)
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent_dict = {
        "id": agent.id,
        "agent_id": agent.agent_id,
        "name": agent.name,
        "instruction": agent.instruction,
        "model_name": agent.model_name,
        "agent_type": agent.agent_type,
        "usecase_id": agent.usecase_id,
        "position_x": agent.position_x,
        "position_y": agent.position_y,
        "created_at": agent.created_at,
        "mcp_tools": []
    }
    
    for assoc in agent.mcp_associations:
        agent_dict["mcp_tools"].append({
            "association_id": assoc.id,
            "mcp_tool": {
                "id": assoc.mcp_tool.id,
                "name": assoc.mcp_tool.name,
                "package_name": assoc.mcp_tool.package_name
            },
            "env_values": assoc.env_values
        })
    
    return agent_dict

@app.put("/api/agents/{agent_id}")
def update_agent(agent_id: str, agent_update: AgentCreate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    for key, value in agent_update.dict().items():
        setattr(agent, key, value)
    
    db.commit()
    db.refresh(agent)
    return agent

@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()
    return {"message": "Agent deleted"}

# Agent-MCP Association
@app.post("/api/agents/{agent_id}/mcp-tools")
def add_mcp_to_agent(agent_id: str, association: AgentMCPCreate, db: Session = Depends(get_db)):
    logger.info(f"Adding MCP tool to agent {agent_id} with data: {association}")
    
    # Check if agent exists
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Check if MCP tool exists
    mcp_tool = db.query(MCPTool).filter(MCPTool.id == association.mcp_tool_id).first()
    if not mcp_tool:
        raise HTTPException(status_code=404, detail="MCP tool not found")
    
    logger.info(f"Found MCP tool: {mcp_tool.name} with env_variables: {mcp_tool.env_variables}")
    
    # Check if tool is already associated with the agent
    existing_association = db.query(AgentMCPAssociation).filter(
        AgentMCPAssociation.agent_id == agent_id,
        AgentMCPAssociation.mcp_tool_id == association.mcp_tool_id
    ).first()
    if existing_association:
        raise HTTPException(
            status_code=409,
            detail=f"MCP tool {mcp_tool.name} is already associated with this agent"
        )

    # Validate environment variables
    if mcp_tool.env_variables:
        required_vars = set(mcp_tool.env_variables)
        provided_vars = set(association.env_values.keys() if association.env_values else {})
        
        # Check for missing required variables
        missing_vars = required_vars - provided_vars
        if missing_vars:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required environment variables: {', '.join(missing_vars)}"
            )
        
        # Check for extra variables that weren't defined in the tool
        extra_vars = provided_vars - required_vars
        if extra_vars:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown environment variables provided: {', '.join(extra_vars)}"
            )
            
        # Validate that no env values are empty
        empty_vars = [k for k, v in association.env_values.items() if not v or not v.strip()]
        if empty_vars:
            raise HTTPException(
                status_code=422,
                detail=f"Empty values provided for environment variables: {', '.join(empty_vars)}"
            )
            
    # Create the association
    agent_mcp = AgentMCPAssociation(
        agent_id=agent_id,
        mcp_tool_id=association.mcp_tool_id,
        env_values=association.env_values
    )
    
    try:
        db.add(agent_mcp)
        db.commit()
        db.refresh(agent_mcp)
        return agent_mcp
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This MCP tool is already associated with this agent"
        )
    
    # Validate environment variables
    required_env_vars = set(mcp_tool.env_variables)
    provided_env_vars = set(association.env_values.keys())
    
    # Check for missing required variables
    missing_vars = required_env_vars - provided_env_vars
    if missing_vars:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required environment variables: {', '.join(missing_vars)}"
        )
    
    # Check for extra variables that weren't defined in the tool
    extra_vars = provided_env_vars - required_env_vars
    if extra_vars:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown environment variables provided: {', '.join(extra_vars)}"
        )
    
    # Validate that no env values are empty
    empty_vars = [k for k, v in association.env_values.items() if not v or not v.strip()]
    if empty_vars:
        raise HTTPException(
            status_code=422,
            detail=f"Empty values provided for environment variables: {', '.join(empty_vars)}"
        )
    
    # Create association
    db_association = AgentMCPAssociation(
        agent_id=agent_id,
        mcp_tool_id=association.mcp_tool_id,
        env_values=association.env_values
    )
    db.add(db_association)
    db.commit()
    db.refresh(db_association)
    
    return {"message": "MCP tool added to agent", "association_id": db_association.id}

@app.delete("/api/agents/{agent_id}/mcp-tools/{association_id}")
def remove_mcp_from_agent(agent_id: str, association_id: int, db: Session = Depends(get_db)):
    association = db.query(AgentMCPAssociation).filter(
        AgentMCPAssociation.id == association_id,
        AgentMCPAssociation.agent_id == agent_id
    ).first()
    
    if not association:
        raise HTTPException(status_code=404, detail="Association not found")
    
    db.delete(association)
    db.commit()
    
    return {"message": "MCP tool removed from agent"}

# Deployment
@app.post("/api/deployments")
async def deploy_agent(deployment: DeploymentCreate, db: Session = Depends(get_db)):
    # Get agent details
    agent = db.query(Agent).filter(Agent.agent_id == deployment.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    deployment_id = str(uuid.uuid4())
    deployment_path = f"./deployments/{deployment_id}"
    
    # Create deployment record
    db_deployment = Deployment(
        deployment_id=deployment_id,
        agent_id=deployment.agent_id,
        deployment_type=deployment.deployment_type,
        status="deploying",
        deployment_path=deployment_path
    )
    db.add(db_deployment)
    db.commit()
    
    # Create deployment in background
    asyncio.create_task(deploy_agent_task(deployment_id, agent, db))
    
    return {"deployment_id": deployment_id, "status": "deploying"}

async def deploy_agent_task(deployment_id: str, agent, db: Session):
    try:
        deployment_path = f"./deployments/{deployment_id}"
        os.makedirs(deployment_path, exist_ok=True)
        
        # Create virtual environment
        subprocess.run([sys.executable, "-m", "venv", f"{deployment_path}/venv"], check=True)
        
        # Install required packages
        pip_path = f"{deployment_path}/venv/bin/pip" if os.name != 'nt' else f"{deployment_path}/venv/Scripts/pip"
        
        packages = ["google-adk"]  # Base package for Google ADK
        
        # Add MCP packages
        for assoc in agent.mcp_associations:
            packages.append(assoc.mcp_tool.package_name)
        
        subprocess.run([pip_path, "install"] + packages, check=True)
        
        # Create agent script
        agent_script = generate_agent_script(agent)
        with open(f"{deployment_path}/agent.py", "w") as f:
            f.write(agent_script)
        
        # Update deployment status
        deployment = db.query(Deployment).filter(Deployment.deployment_id == deployment_id).first()
        deployment.status = "running"
        deployment.port = 8100  # You can make this dynamic
        db.commit()
        
        # Start agent
        python_path = f"{deployment_path}/venv/bin/python" if os.name != 'nt' else f"{deployment_path}/venv/Scripts/python"
        subprocess.Popen([python_path, f"{deployment_path}/agent.py"])
        
    except Exception as e:
        logger.error(f"Deployment failed: {str(e)}")
        deployment = db.query(Deployment).filter(Deployment.deployment_id == deployment_id).first()
        deployment.status = "error"
        db.commit()

def generate_agent_script(agent):
    # Generate Python script for agent based on Google ADK
    script = f'''
import os
from google.genai import Client, Model
from google.genai.tools import Tool

# Set environment variables
os.environ["BASE_URL"] = "https://api.example.com"
os.environ["CERTS_PATH"] = "/path/to/certs"
os.environ["APIGEE_URL"] = "https://apigee.example.com"
os.environ["USE_API_GATEWAY"] = "true"

# Agent configuration
os.environ["USECASE_ID"] = "{agent.usecase_id or ''}"
os.environ["API_KEY"] = "{agent.api_key or ''}"
os.environ["CONSUMER_KEY"] = "{agent.consumer_key or ''}"
os.environ["CONSUMER_SECRET"] = "{agent.consumer_secret or ''}"

# Initialize client
client = Client()

# Create agent
agent = client.agents.create(
    name="{agent.name}",
    model="{agent.model_name}",
    system_instruction="""{agent.instruction}""",
    tools=[]
)

# Add MCP tools
'''
    
    for assoc in agent.mcp_associations:
        # Add env variables for each tool
        for env_name, env_value in assoc.env_values.items():
            script += f'os.environ["{env_name}"] = "{env_value}"\n'
        
        script += f'''
# Import and add {assoc.mcp_tool.name}
# Tool implementation would go here
'''
    
    script += '''
# Start chat interface
if __name__ == "__main__":
    print(f"Agent {agent.name} is running on port 8100")
    # Start web server for chat UI
    # Implementation would go here
'''
    
    return script

# WebSocket for logs
@app.websocket("/ws/logs/{client_id}")
async def websocket_logs(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# Remote Configuration
@app.post("/api/remote-configs")
def create_remote_config(config: RemoteConfigCreate, db: Session = Depends(get_db)):
    db_config = RemoteConfig(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@app.get("/api/remote-configs")
def list_remote_configs(db: Session = Depends(get_db)):
    return db.query(RemoteConfig).all()

# Health check
@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    import sys
    uvicorn.run(app, host="0.0.0.0", port=8000)