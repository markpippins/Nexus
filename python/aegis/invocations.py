"""
SOLScript Parser with invoke keyword support
Minimal extension - adds a single keyword that leverages existing infrastructure
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import re
import json
import uuid

# ---------- SOLScript AST with Invoke ----------

@dataclass
class SOLInvoke:
    """Invoke node in the SOL AST"""
    target: str  # The verb/action name
    parameters: Dict[str, Any]  # Parameters matching the shrapnel type
    entity_context: Optional[str] = None
    work_request_id: Optional[str] = None
    line: int = 0
    
    def __repr__(self):
        return f"INVOKE {self.target}({self.parameters})"

class SOLScriptParser:
    """
    SOLScript parser with invoke keyword support.
    Minimal extension - just parses invoke statements.
    """
    
    def __init__(self, invoke_registry: 'InvokeRegistry'):
        self.invoke_registry = invoke_registry
        self.invoke_pattern = re.compile(
            r'^\s*invoke\s+(\w+)\s*\(([^)]*)\)\s*;?\s*$',
            re.IGNORECASE | re.MULTILINE
        )
    
    def parse(self, script: str) -> List[SOLInvoke]:
        """
        Parse a SOLScript and extract invoke statements.
        Other SOL expressions remain as-is (attribute_ref, operator, etc.)
        """
        invokes = []
        
        # Find all invoke statements
        for match in self.invoke_pattern.finditer(script):
            target = match.group(1)
            params_str = match.group(2)
            
            # Parse parameters
            parameters = self._parse_parameters(params_str)
            
            # Get the target definition
            target_def = self.invoke_registry.get_target(target)
            if target_def:
                # Validate parameters
                validated_params = self._validate_parameters(
                    parameters, 
                    target_def['parameter_schema']
                )
                
                invokes.append(
                    SOLInvoke(
                        target=target,
                        parameters=validated_params,
                        line=script.count('\n', 0, match.start()) + 1
                    )
                )
            else:
                # Target not found - still add with warning
                invokes.append(
                    SOLInvoke(
                        target=target,
                        parameters=parameters,
                        line=script.count('\n', 0, match.start()) + 1
                    )
                )
        
        return invokes
    
    def _parse_parameters(self, params_str: str) -> Dict[str, Any]:
        """Parse parameter string into key-value pairs"""
        if not params_str.strip():
            return {}
        
        parameters = {}
        # Simple key=value parsing
        for param in params_str.split(','):
            if '=' in param:
                key, value = param.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Try to parse value as JSON
                try:
                    parameters[key] = json.loads(value)
                except json.JSONDecodeError:
                    # Value is a string
                    parameters[key] = value.strip('\'"')
            else:
                # Positional parameter - use index
                parameters[str(len(parameters))] = param.strip()
        
        return parameters
    
    def _validate_parameters(self, parameters: Dict[str, Any], 
                           schema: Dict[str, Any]) -> Dict[str, Any]:
        """Validate parameters against shrapnel schema"""
        if not schema:
            return parameters
        
        validated = {}
        required = schema.get('required', [])
        
        for key, value in parameters.items():
            # Check if parameter exists in schema
            if key not in schema.get('properties', {}):
                continue
            
            # Validate type
            prop_schema = schema['properties'][key]
            param_type = prop_schema.get('type')
            
            if param_type == 'string':
                validated[key] = str(value)
            elif param_type == 'number':
                validated[key] = float(value)
            elif param_type == 'integer':
                validated[key] = int(value)
            elif param_type == 'boolean':
                validated[key] = bool(value)
            elif param_type == 'uuid':
                validated[key] = str(value)
            else:
                validated[key] = value
        
        # Check required parameters
        for req in required:
            if req not in validated:
                raise ValueError(f"Required parameter '{req}' missing")
        
        return validated

# ---------- Invoke Registry ----------

class InvokeRegistry:
    """
    Registry for invoke targets.
    Leverages state machine registry for actions and shrapnel for parameters.
    """
    
    def __init__(self, db_connection=None):
        self.db = db_connection
        self.cache = {}
        self.targets = {}
    
    def register_target(self, name: str, registry_id: str, 
                       transition_id: Optional[str] = None,
                       parameter_schema: Dict[str, Any] = None,
                       description: str = None):
        """Register an invoke target"""
        self.targets[name] = {
            'name': name,
            'registry_id': registry_id,
            'transition_id': transition_id,
            'parameter_schema': parameter_schema or {'type': 'object'},
            'description': description
        }
    
    def get_target(self, name: str) -> Optional[Dict[str, Any]]:
        """Get an invoke target by name"""
        if name in self.cache:
            return self.cache[name]
        
        # Try to load from database
        target = self._load_target_from_db(name)
        if target:
            self.cache[name] = target
            return target
        
        # Check in-memory registry
        return self.targets.get(name)
    
    def _load_target_from_db(self, name: str) -> Optional[Dict[str, Any]]:
        """Load invoke target from database"""
        if not self.db:
            return None
        
        # In practice, query sol_script.invoke_target
        # Simplified for example
        return None
    
    def list_targets(self) -> List[str]:
        """List all registered invoke targets"""
        targets = set(self.targets.keys())
        # Also list from database
        if self.db:
            pass
        return sorted(list(targets))

# ---------- SOLScript Interpreter with Invoke ----------

class SOLScriptInterpreter:
    """
    SOLScript interpreter with invoke support.
    Minimal - just executes invoke statements.
    """
    
    def __init__(self, invoke_registry: InvokeRegistry, 
                 interpreter: 'ResolutionInterpreter'):
        self.invoke_registry = invoke_registry
        self.interpreter = interpreter
        self.parser = SOLScriptParser(invoke_registry)
    
    def evaluate(self, script: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a SOLScript.
        Other SOL expressions (attribute_ref, operator, etc.) are evaluated normally.
        Invoke statements are dispatched to the appropriate handler.
        """
        results = {}
        
        # First, handle regular SOL expressions (existing functionality)
        # This would use the existing SOL evaluator
        
        # Parse invoke statements
        invokes = self.parser.parse(script)
        
        # Execute invokes
        for invoke in invokes:
            try:
                # Get target definition
                target = self.invoke_registry.get_target(invoke.target)
                if not target:
                    results[invoke.target] = {
                        'status': 'error',
                        'message': f"Target '{invoke.target}' not found"
                    }
                    continue
                
                # Execute the invoke
                result = self._execute_invoke(invoke, target, context)
                results[invoke.target] = result
                
            except Exception as e:
                results[invoke.target] = {
                    'status': 'error',
                    'message': str(e)
                }
        
        return results
    
    def _execute_invoke(self, invoke: SOLInvoke, target: Dict[str, Any],
                       context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an invoke target"""
        
        # Resolve entity context if specified
        entity_id = invoke.entity_context
        if entity_id and entity_id in context:
            entity_id = context[entity_id]
        
        # If this is a state transition, apply it
        if target.get('transition_id'):
            return self._execute_transition(invoke, target, entity_id, context)
        
        # Otherwise, execute as generic action
        return self._execute_action(invoke, target, context)
    
    def _execute_transition(self, invoke: SOLInvoke, target: Dict[str, Any],
                          entity_id: Optional[str], 
                          context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a state transition"""
        
        # Get parameters
        params = invoke.parameters
        entity_id = params.get('entity_id') or entity_id
        
        if not entity_id:
            return {
                'status': 'error',
                'message': 'No entity_id provided'
            }
        
        # Apply transition using the resolution schema
        transition_id = target['transition_id']
        registry_id = target['registry_id']
        
        try:
            # Use the resolution interpreter to apply the transition
            # This is the bridge from invoke to resolution
            from sol_script import sol_invoke
            
            # Call the database function
            result = sol_invoke(
                invoke.target,
                json.dumps(invoke.parameters),
                context.get('work_request_id'),
                entity_id
            )
            
            return {
                'status': 'success',
                'result': result,
                'entity_id': entity_id,
                'transition_id': transition_id
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def _execute_action(self, invoke: SOLInvoke, target: Dict[str, Any],
                       context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a generic action"""
        # Generic action execution
        # In practice, this would dispatch to a handler
        return {
            'status': 'success',
            'target': invoke.target,
            'parameters': invoke.parameters,
            'executed': True
        }

# ---------- Shrapnel Type Integration ----------

class ShrapnelParameterResolver:
    """
    Resolves parameters using shrapnel types.
    Shrapnel types define the parameter schema for invoke targets.
    """
    
    def __init__(self, shrapnel_registry: Any):
        self.shrapnel_registry = shrapnel_registry
    
    def resolve_parameters(self, target_name: str, 
                          params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve parameters using shrapnel type definitions.
        This bridges invoke parameters to shrapnel types.
        """
        # Get shrapnel type for this target
        shrapnel_type = self._get_shrapnel_type(target_name)
        if not shrapnel_type:
            return params
        
        resolved = {}
        
        # Apply shrapnel type transformations
        for key, value in params.items():
            if key in shrapnel_type.get('fields', {}):
                field_def = shrapnel_type['fields'][key]
                resolved[key] = self._transform_value(value, field_def)
            else:
                resolved[key] = value
        
        return resolved
    
    def _get_shrapnel_type(self, target_name: str) -> Optional[Dict[str, Any]]:
        """Get shrapnel type for a target"""
        # In practice, look up in shrapnel registry
        return None
    
    def _transform_value(self, value: Any, field_def: Dict[str, Any]) -> Any:
        """Transform a value based on shrapnel field definition"""
        field_type = field_def.get('type')
        
        if field_type == 'uuid':
            if isinstance(value, str):
                return value
            return str(uuid.uuid4())
        elif field_type == 'timestamp':
            from datetime import datetime
            if isinstance(value, datetime):
                return value.isoformat()
            return datetime.now().isoformat()
        elif field_type == 'json':
            if isinstance(value, dict):
                return value
            return json.loads(value)
        
        return value

# ---------- Complete Usage Example ----------

def example_invoke_workflow():
    """Complete example of using the invoke keyword"""
    
    # Create the interpreter and registry
    interpreter = ResolutionInterpreter()
    registry = InvokeRegistry()
    
    # Register invoke targets
    registry.register_target(
        name='approve_work_request',
        registry_id='registry-123',
        transition_id='transition-456',
        parameter_schema={
            'type': 'object',
            'properties': {
                'entity_id': {'type': 'string', 'format': 'uuid'},
                'reviewer': {'type': 'string'},
                'comments': {'type': 'string'}
            },
            'required': ['entity_id']
        },
        description='Approve a work request'
    )
    
    registry.register_target(
        name='dispatch_work_request',
        registry_id='registry-123',
        parameter_schema={
            'type': 'object',
            'properties': {
                'entity_id': {'type': 'string', 'format': 'uuid'},
                'assigned_to': {'type': 'string'}
            },
            'required': ['entity_id', 'assigned_to']
        },
        description='Dispatch a work request'
    )
    
    # Create the SOLScript interpreter
    sol_interpreter = SOLScriptInterpreter(registry, interpreter)
    
    # Example SOLScript with invoke
    script = """
    -- SOLScript for processing a work request
    
    -- First, resolve the entity
    entity = resolve_entity(external_id: "WR-001", concept: "WorkRequest");
    
    -- Then approve it
    invoke approve_work_request(entity_id: entity.id, reviewer: "alice", comments: "Looks good");
    
    -- Check if we need to dispatch
    if entity.priority == "high" then
        invoke dispatch_work_request(entity_id: entity.id, assigned_to: "bob");
    end;
    """
    
    # Execute
    context = {
        'external_id': 'WR-001',
        'work_request_id': 'wr-123'
    }
    
    results = sol_interpreter.evaluate(script, context)
    
    print("SOLScript Execution Results:")
    print(json.dumps(results, indent=2))
    
    return results

if __name__ == "__main__":
    results = example_invoke_workflow()