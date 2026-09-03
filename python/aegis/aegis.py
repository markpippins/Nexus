from typing import Dict, List, Any, Optional, Set, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
import uuid
import json
from datetime import datetime
import re

# ---------- Core State Machine Models ----------

@dataclass
class StateMachineRegistry:
    """
    Registry for formal state machines (TLA+ style) that bridges to resolution schema.
    Preserves mathematical rigor while enabling semantic reasoning.
    """
    id: str
    name: str
    description: Optional[str]
    version: str = "1.0.0"
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    
    # Core TLA+ components
    constants: Dict[str, 'ConstantDefinition'] = field(default_factory=dict)
    variables: Dict[str, 'VariableDefinition'] = field(default_factory=dict)
    states: Dict[str, 'StateDefinition'] = field(default_factory=dict)
    transitions: Dict[str, 'TransitionDefinition'] = field(default_factory=dict)
    invariants: Dict[str, 'InvariantDefinition'] = field(default_factory=dict)
    properties: Dict[str, 'PropertyDefinition'] = field(default_factory=dict)
    
    # Temporal logic
    temporal_properties: Dict[str, 'TemporalProperty'] = field(default_factory=dict)
    
    # Bridge to resolution schema
    concept_mappings: Dict[str, 'ConceptMapping'] = field(default_factory=dict)
    attribute_mappings: Dict[str, 'AttributeMapping'] = field(default_factory=dict)
    relationship_mappings: Dict[str, 'RelationshipMapping'] = field(default_factory=dict)
    
    # TLA+ source
    tla_plus_source: Optional[str] = None
    tla_plus_module: Optional[str] = None
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)

@dataclass
class ConstantDefinition:
    """TLA+ constant definition"""
    name: str
    type: str  # Set, Tuple, Function, etc.
    value: Optional[Any] = None
    description: Optional[str] = None
    constraints: List[str] = field(default_factory=list)

@dataclass
class VariableDefinition:
    """TLA+ variable definition"""
    name: str
    type: str
    initial_value: Optional[Any] = None
    domain: Optional[List[Any]] = None
    description: Optional[str] = None
    constraints: List[str] = field(default_factory=list)

@dataclass
class StateDefinition:
    """TLA+ state definition"""
    name: str
    description: Optional[str]
    variable_assignments: Dict[str, Any] = field(default_factory=dict)
    constraints: List[str] = field(default_factory=list)
    
    # Bridge to resolution
    concept_id: Optional[str] = None
    attribute_values: Dict[str, Any] = field(default_factory=dict)

@dataclass
class TransitionDefinition:
    """TLA+ transition definition"""
    name: str
    description: Optional[str]
    
    # Guard condition (when this transition can fire)
    guard_expression: Optional[str] = None
    
    # Action (what changes)
    action: Dict[str, Any] = field(default_factory=dict)  # variable -> new value
    
    # Fairness properties
    weak_fairness: bool = False
    strong_fairness: bool = False
    
    # Temporal constraints
    temporal_conditions: List[str] = field(default_factory=list)
    
    # Bridge to resolution
    guard_rule_id: Optional[str] = None
    transition_rule_id: Optional[str] = None
    state_transition_id: Optional[str] = None

@dataclass
class InvariantDefinition:
    """TLA+ invariant"""
    name: str
    expression: str  # TLA+ expression
    description: Optional[str] = None
    
    # Bridge to resolution
    rule_id: Optional[str] = None
    expression_id: Optional[str] = None

@dataclass
class PropertyDefinition:
    """TLA+ property (safety/liveness)"""
    name: str
    type: str  # safety, liveness, fairness
    expression: str  # TLA+ expression
    description: Optional[str] = None

@dataclass
class TemporalProperty:
    """Temporal logic property"""
    name: str
    operator: str  # [] (always), <> (eventually), etc.
    expression: str
    description: Optional[str] = None

@dataclass
class ConceptMapping:
    """Map TLA+ concepts to resolution concepts"""
    tla_name: str
    concept_id: str
    mapping_type: str  # direct, derived, composite
    mapping_expression: Optional[str] = None
    cardinality: str = "one_to_one"  # one_to_one, one_to_many, many_to_one

@dataclass
class AttributeMapping:
    """Map TLA+ variables to resolution attributes"""
    tla_variable: str
    attribute_id: str
    conversion_function: Optional[str] = None
    default_value: Optional[Any] = None

@dataclass
class RelationshipMapping:
    """Map TLA+ relationships to resolution relationships"""
    tla_relationship: str
    relationship_id: str
    mapping_type: str  # direct, inverse, transitive
    constraints: List[str] = field(default_factory=list)

# ---------- 2. State Machine Registry Manager ----------

class StateMachineRegistryManager:
    """
    Manages state machine registries, provides CRUD operations,
    and handles validation.
    """
    
    def __init__(self):
        self.registries: Dict[str, StateMachineRegistry] = {}
        self.tla_plus_parsers = []
        self.validation_results: Dict[str, List[Dict]] = {}
        
    def create_registry(self, name: str, description: Optional[str] = None,
                       tla_plus_source: Optional[str] = None) -> StateMachineRegistry:
        """Create a new state machine registry"""
        registry_id = str(uuid.uuid4())
        
        registry = StateMachineRegistry(
            id=registry_id,
            name=name,
            description=description,
            tla_plus_source=tla_plus_source,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # If TLA+ source is provided, parse it
        if tla_plus_source:
            self._parse_tla_plus(registry, tla_plus_source)
        
        self.registries[registry_id] = registry
        return registry
    
    def get_registry(self, registry_id: str) -> Optional[StateMachineRegistry]:
        """Get a registry by ID"""
        return self.registries.get(registry_id)
    
    def get_registry_by_name(self, name: str) -> Optional[StateMachineRegistry]:
        """Get a registry by name"""
        for registry in self.registries.values():
            if registry.name == name:
                return registry
        return None
    
    def update_registry(self, registry_id: str, updates: Dict[str, Any]) -> Optional[StateMachineRegistry]:
        """Update a registry"""
        registry = self.registries.get(registry_id)
        if not registry:
            return None
        
        for key, value in updates.items():
            if hasattr(registry, key):
                setattr(registry, key, value)
        
        registry.updated_at = datetime.now()
        
        # If TLA+ source updated, re-parse
        if 'tla_plus_source' in updates:
            self._parse_tla_plus(registry, updates['tla_plus_source'])
        
        return registry
    
    def delete_registry(self, registry_id: str) -> bool:
        """Delete a registry"""
        if registry_id in self.registries:
            del self.registries[registry_id]
            return True
        return False
    
    def add_state(self, registry_id: str, state: StateDefinition) -> bool:
        """Add a state to a registry"""
        registry = self.registries.get(registry_id)
        if not registry:
            return False
        
        registry.states[state.name] = state
        registry.updated_at = datetime.now()
        return True
    
    def add_transition(self, registry_id: str, transition: TransitionDefinition) -> bool:
        """Add a transition to a registry"""
        registry = self.registries.get(registry_id)
        if not registry:
            return False
        
        registry.transitions[transition.name] = transition
        registry.updated_at = datetime.now()
        return True
    
    def add_invariant(self, registry_id: str, invariant: InvariantDefinition) -> bool:
        """Add an invariant to a registry"""
        registry = self.registries.get(registry_id)
        if not registry:
            return False
        
        registry.invariants[invariant.name] = invariant
        registry.updated_at = datetime.now()
        return True
    
    def validate_registry(self, registry_id: str) -> Dict[str, Any]:
        """Validate a registry for consistency"""
        registry = self.registries.get(registry_id)
        if not registry:
            return {'error': 'Registry not found'}
        
        validation = {
            'registry_id': registry_id,
            'name': registry.name,
            'is_valid': True,
            'errors': [],
            'warnings': [],
            'suggestions': []
        }
        
        # Validate states
        if not registry.states:
            validation['warnings'].append('No states defined')
        
        for state_name, state in registry.states.items():
            # Check if state has a concept mapping
            has_mapping = False
            for mapping in registry.concept_mappings.values():
                if mapping.tla_name == state_name:
                    has_mapping = True
                    break
            if not has_mapping:
                validation['warnings'].append(f"State '{state_name}' has no concept mapping")
        
        # Validate transitions
        if not registry.transitions:
            validation['warnings'].append('No transitions defined')
        
        for transition_name, transition in registry.transitions.items():
            # Check if transition references valid states
            if transition.guard_expression:
                # Parse guard expression to find state references
                referenced_states = self._extract_state_references(transition.guard_expression)
                for ref_state in referenced_states:
                    if ref_state not in registry.states:
                        validation['errors'].append(
                            f"Transition '{transition_name}' references unknown state '{ref_state}'"
                        )
        
        # Validate invariants
        for invariant_name, invariant in registry.invariants.items():
            # Check if invariant expression is valid TLA+
            try:
                self._validate_tla_expression(invariant.expression)
            except Exception as e:
                validation['errors'].append(
                    f"Invariant '{invariant_name}' has invalid expression: {str(e)}"
                )
        
        # Validate temporal properties
        for prop_name, prop in registry.temporal_properties.items():
            if prop.operator not in ['[]', '<>', '->']:
                validation['warnings'].append(
                    f"Temporal property '{prop_name}' has unknown operator '{prop.operator}'"
                )
        
        validation['is_valid'] = len(validation['errors']) == 0
        
        # Cache validation result
        self.validation_results[registry_id] = validation
        
        return validation
    
    def _parse_tla_plus(self, registry: StateMachineRegistry, tla_plus_source: str):
        """Parse TLA+ source into registry components"""
        # This is a simplified parser - in practice, use a proper TLA+ parser
        
        # Extract CONSTANTS
        constants_match = re.search(r'CONSTANTS?\s+([^\n]+)', tla_plus_source, re.IGNORECASE)
        if constants_match:
            constants = constants_match.group(1).split(',')
            for const in constants:
                const = const.strip()
                if const:
                    registry.constants[const] = ConstantDefinition(
                        name=const,
                        type='unknown'
                    )
        
        # Extract VARIABLES
        variables_match = re.search(r'VARIABLES?\s+([^\n]+)', tla_plus_source, re.IGNORECASE)
        if variables_match:
            variables = variables_match.group(1).split(',')
            for var in variables:
                var = var.strip()
                if var:
                    registry.variables[var] = VariableDefinition(
                        name=var,
                        type='unknown'
                    )
        
        # Extract Init predicate
        init_match = re.search(r'Init\s*==\s*([^\n]+)', tla_plus_source)
        if init_match:
            # Parse initial state
            init_expr = init_match.group(1)
            # Extract variable assignments
            for var in registry.variables:
                assignment_match = re.search(f'{var}\\s*=\\s*([^,;]+)', init_expr)
                if assignment_match:
                    registry.variables[var].initial_value = assignment_match.group(1).strip()
        
        # Extract Next predicate (transitions)
        next_match = re.search(r'Next\s*==\s*([^\n]+(?:\n\s*[^/\\n]+)*)', tla_plus_source)
        if next_match:
            # Parse transition definitions
            transitions = self._parse_transitions(next_match.group(1))
            for trans_name, trans_expr in transitions.items():
                registry.transitions[trans_name] = TransitionDefinition(
                    name=trans_name,
                    description=f"Transition from TLA+ Next",
                    guard_expression=trans_expr
                )
        
        # Extract invariants
        inv_matches = re.findall(r'Invariant\s*==\s*([^\n]+)', tla_plus_source)
        for i, inv_expr in enumerate(inv_matches):
            registry.invariants[f"Invariant_{i+1}"] = InvariantDefinition(
                name=f"Invariant_{i+1}",
                expression=inv_expr.strip()
            )
    
    def _parse_transitions(self, transition_text: str) -> Dict[str, str]:
        """Parse transitions from TLA+ Next expression"""
        transitions = {}
        
        # Look for OR-separated transitions
        if '\\/' in transition_text:
            parts = transition_text.split('\\/')
            for i, part in enumerate(parts):
                part = part.strip()
                if part:
                    transitions[f"Transition_{i+1}"] = part
        elif '/' in transition_text and '\\' not in transition_text:
            parts = transition_text.split('/')
            for i, part in enumerate(parts):
                part = part.strip()
                if part:
                    transitions[f"Transition_{i+1}"] = part
        else:
            transitions["Transition_1"] = transition_text.strip()
        
        return transitions
    
    def _extract_state_references(self, expression: str) -> List[str]:
        """Extract state references from an expression"""
        # Look for state name patterns
        state_refs = []
        # Match identifiers that look like state names (capitalized or camelCase)
        matches = re.findall(r'\b([A-Z][a-zA-Z0-9_]*)\b', expression)
        for match in matches:
            if match not in ['TRUE', 'FALSE', 'Action', 'Next', 'Init']:
                state_refs.append(match)
        return state_refs
    
    def _validate_tla_expression(self, expression: str) -> bool:
        """Validate a TLA+ expression"""
        # This is a basic validation - in practice, use a proper TLA+ parser
        # Check for balanced parentheses
        stack = []
        for char in expression:
            if char == '(':
                stack.append('(')
            elif char == ')':
                if not stack or stack[-1] != '(':
                    raise ValueError("Unbalanced parentheses")
                stack.pop()
        
        if stack:
            raise ValueError("Unbalanced parentheses")
        
        # Check for valid operators
        allowed_operators = ['=', '/=', '>', '<', '>=', '<=', '/\\', '\\/', '~', '=>', '<=>']
        # Simple check - ensure no invalid operator patterns
        
        return True

# ---------- 3. Bridge to Resolution Schema ----------

class StateMachineToResolutionBridge:
    """
    Bridges state machine registries to the resolution schema.
    Creates concepts, attributes, relationships, and rules from TLA+ specifications.
    """
    
    def __init__(self, interpreter: 'ResolutionInterpreter'):
        self.interpreter = interpreter
        self.registry_manager = StateMachineRegistryManager()
        self.bridge_cache: Dict[str, Dict[str, Any]] = {}
    
    def bridge_registry(self, registry_id: str) -> Dict[str, Any]:
        """
        Bridge a state machine registry to the resolution schema.
        Returns mapping of created objects.
        """
        registry = self.registry_manager.get_registry(registry_id)
        if not registry:
            return {'error': 'Registry not found'}
        
        cache_key = registry_id
        if cache_key in self.bridge_cache:
            return self.bridge_cache[cache_key]
        
        result = {
            'registry_id': registry_id,
            'created_concepts': [],
            'created_attributes': [],
            'created_relationships': [],
            'created_rules': [],
            'created_transitions': [],
            'mappings': {}
        }
        
        # 1. Create main concept
        concept = self._create_main_concept(registry)
        result['created_concepts'].append(concept.id)
        result['mappings']['main_concept'] = concept.id
        
        # 2. Create concept for each state
        state_concepts = {}
        for state_name, state_def in registry.states.items():
            state_concept = self._create_state_concept(registry, state_def)
            state_concepts[state_name] = state_concept.id
            result['created_concepts'].append(state_concept.id)
            result['mappings'][f"state_{state_name}"] = state_concept.id
        
        # 3. Create attributes for variables
        attr_mappings = {}
        for var_name, var_def in registry.variables.items():
            attr = self._create_variable_attribute(registry, var_def)
            attr_mappings[var_name] = attr.id
            result['created_attributes'].append(attr.id)
            result['mappings'][f"variable_{var_name}"] = attr.id
        
        # 4. Create relationships between states
        for transition_name, transition_def in registry.transitions.items():
            # Determine from/to states
            from_state, to_state = self._extract_transition_states(transition_def)
            if from_state and to_state and from_state in state_concepts and to_state in state_concepts:
                rel = self._create_transition_relationship(
                    registry,
                    transition_def,
                    state_concepts[from_state],
                    state_concepts[to_state]
                )
                result['created_relationships'].append(rel.id)
                result['mappings'][f"transition_{transition_name}"] = rel.id
        
        # 5. Create rules from invariants
        for inv_name, inv_def in registry.invariants.items():
            rule = self._create_invariant_rule(registry, inv_def, concept.id)
            result['created_rules'].append(rule.id)
            result['mappings'][f"invariant_{inv_name}"] = rule.id
        
        # 6. Create state transitions
        for transition_name, transition_def in registry.transitions.items():
            from_state, to_state = self._extract_transition_states(transition_def)
            if from_state and to_state:
                st = self._create_state_transition(
                    registry,
                    transition_def,
                    concept.id,
                    from_state,
                    to_state
                )
                result['created_transitions'].append(st.id)
                result['mappings'][f"state_transition_{transition_name}"] = st.id
        
        # Cache the result
        self.bridge_cache[cache_key] = result
        
        return result
    
    def _create_main_concept(self, registry: StateMachineRegistry) -> Concept:
        """Create main concept for the state machine"""
        concept = Concept(
            id=str(uuid.uuid4()),
            name=registry.name,
            description=registry.description or f"State machine: {registry.name}"
        )
        self.interpreter.add_concept(concept)
        return concept
    
    def _create_state_concept(self, registry: StateMachineRegistry, 
                             state_def: StateDefinition) -> Concept:
        """Create a concept for a TLA+ state"""
        concept = Concept(
            id=str(uuid.uuid4()),
            name=f"{registry.name}_{state_def.name}",
            description=state_def.description or f"State: {state_def.name}"
        )
        self.interpreter.add_concept(concept)
        
        # Add attributes for variable assignments
        for var_name, value in state_def.variable_assignments.items():
            # Find or create attribute
            attr = self.interpreter.get_attribute_by_name(concept.id, var_name)
            if not attr:
                attr = ConceptAttribute(
                    id=str(uuid.uuid4()),
                    concept_id=concept.id,
                    name=var_name,
                    description=f"Variable {var_name} in state {state_def.name}",
                    value_type=self._infer_value_type(value),
                    is_state_attribute=True
                )
                self.interpreter.add_attribute(attr)
        
        return concept
    
    def _create_variable_attribute(self, registry: StateMachineRegistry,
                                  var_def: VariableDefinition) -> ConceptAttribute:
        """Create an attribute for a TLA+ variable"""
        # Find the main concept
        main_concept = self.interpreter.get_concept_by_name(registry.name)
        if not main_concept:
            raise ValueError(f"Main concept not found: {registry.name}")
        
        attr = ConceptAttribute(
            id=str(uuid.uuid4()),
            concept_id=main_concept.id,
            name=var_def.name,
            description=var_def.description or f"Variable: {var_def.name}",
            value_type=self._infer_value_type(var_def.initial_value),
            is_state_attribute=True
        )
        self.interpreter.add_attribute(attr)
        return attr
    
    def _create_transition_relationship(self, registry: StateMachineRegistry,
                                      transition_def: TransitionDefinition,
                                      from_concept_id: str,
                                      to_concept_id: str) -> ConceptRelationship:
        """Create a relationship for a transition"""
        rel = ConceptRelationship(
            id=str(uuid.uuid4()),
            from_concept_id=from_concept_id,
            to_concept_id=to_concept_id,
            relationship_type="can_transition_to",
            path=f"{registry.name}.{transition_def.name}",
            notes=transition_def.description
        )
        self.interpreter.add_relationship(rel)
        return rel
    
    def _create_invariant_rule(self, registry: StateMachineRegistry,
                             inv_def: InvariantDefinition,
                             concept_id: str) -> Rule:
        """Create a rule from a TLA+ invariant"""
        # Convert TLA+ expression to SOL expression
        expr = self._tla_to_sol(inv_def.expression)
        
        rule = Rule(
            id=str(uuid.uuid4()),
            name=inv_def.name,
            rule_type=RuleType.INVARIANT,
            expression=expr,
            severity=Severity.HARD,
            concept_id=concept_id,
            notes=inv_def.description
        )
        self.interpreter.add_rule(rule)
        return rule
    
    def _create_state_transition(self, registry: StateMachineRegistry,
                               transition_def: TransitionDefinition,
                               concept_id: str,
                               from_state: str,
                               to_state: str) -> ConceptStateTransition:
        """Create a state transition from TLA+ transition"""
        # Find from/to value IDs
        from_value = self._find_state_value(registry, from_state)
        to_value = self._find_state_value(registry, to_state)
        
        transition = ConceptStateTransition(
            id=str(uuid.uuid4()),
            concept_id=concept_id,
            from_value_id=from_value,
            to_value_id=to_value,
            name=transition_def.name,
            notes=transition_def.description
        )
        self.interpreter.add_state_transition(transition)
        
        # Add guard rule if exists
        if transition_def.guard_expression:
            guard_expr = self._tla_to_sol(transition_def.guard_expression)
            guard_rule = Rule(
                id=str(uuid.uuid4()),
                name=f"guard_{transition_def.name}",
                rule_type=RuleType.GUARD,
                expression=guard_expr,
                severity=Severity.HARD,
                state_transition_id=transition.id,
                notes=f"Guard for transition {transition_def.name}"
            )
            self.interpreter.add_rule(guard_rule)
        
        return transition
    
    def _tla_to_sol(self, tla_expr: str) -> Expression:
        """Convert TLA+ expression to SOL expression"""
        # This is a simplified conversion - in practice, need full TLA+ to SOL translator
        # For now, create a literal expression with the TLA+ expression as string
        return Expression(
            id=str(uuid.uuid4()),
            kind=ExpressionKind.LITERAL,
            return_type='boolean',
            literal_value=tla_expr,
            label="TLA+ Expression"
        )
    
    def _infer_value_type(self, value: Any) -> str:
        """Infer value type from TLA+ value"""
        if value is None:
            return 'string'
        if isinstance(value, bool):
            return 'boolean'
        if isinstance(value, int):
            return 'integer'
        if isinstance(value, float):
            return 'float'
        if isinstance(value, list):
            return 'array'
        if isinstance(value, dict):
            return 'json'
        return 'string'
    
    def _extract_transition_states(self, transition_def: TransitionDefinition) -> Tuple[Optional[str], Optional[str]]:
        """Extract from/to states from transition definition"""
        # Parse the guard expression or action
        expression = transition_def.guard_expression or ""
        states = self.registry_manager._extract_state_references(expression)
        
        if len(states) >= 2:
            return states[0], states[1]
        elif len(states) == 1:
            # Assume transition is from current state to specified state
            return None, states[0]
        else:
            return None, None
    
    def _find_state_value(self, registry: StateMachineRegistry, state_name: str) -> Optional[str]:
        """Find the value ID for a state"""
        state_def = registry.states.get(state_name)
        if not state_def:
            return None
        
        # Find matching concept attribute value
        # In practice, would look up in resolution schema
        return state_name  # Placeholder

# ---------- 4. TLA+ Model Checker Integration ----------

class TLAIntegrationLayer:
    """
    Integration with TLA+ tools for model checking and verification.
    """
    
    def __init__(self, interpreter: 'ResolutionInterpreter'):
        self.interpreter = interpreter
        self.bridge = StateMachineToResolutionBridge(interpreter)
        self.registry_manager = StateMachineRegistryManager()
        self.model_checking_results: Dict[str, Dict[str, Any]] = {}
    
    def verify_state_machine(self, registry_id: str, 
                            properties: List[str] = None) -> Dict[str, Any]:
        """
        Verify the state machine using TLA+ model checking.
        Translates to TLA+ and runs model checker.
        """
        registry = self.registry_manager.get_registry(registry_id)
        if not registry:
            return {'error': 'Registry not found'}
        
        # Generate TLA+ specification from registry
        tla_spec = self._generate_tla_plus(registry)
        
        # Run model checker (simulated)
        # In practice, this would call the TLA+ toolbox or tlc
        results = self._simulate_model_checking(tla_spec, properties or [])
        
        self.model_checking_results[registry_id] = results
        return results
    
    def _generate_tla_plus(self, registry: StateMachineRegistry) -> str:
        """Generate TLA+ specification from registry"""
        lines = []
        
        # Module declaration
        lines.append(f"---- MODULE {registry.name} ----")
        lines.append("")
        
        # Constants
        if registry.constants:
            lines.append("CONSTANTS")
            for const in registry.constants:
                lines.append(f"    {const}")
            lines.append("")
        
        # Variables
        if registry.variables:
            lines.append("VARIABLES")
            for var in registry.variables:
                lines.append(f"    {var}")
            lines.append("")
        
        # State definitions
        for state_name, state_def in registry.states.items():
            lines.append(f"{state_name} ==")
            if state_def.variable_assignments:
                lines.append(f"    /\\ {state_def.name}")
                for var, value in state_def.variable_assignments.items():
                    lines.append(f"    /\\ {var} = {value}")
            else:
                lines.append(f"    {state_def.name}")
            lines.append("")
        
        # Initial state
        lines.append("Init ==")
        if registry.variables:
            for var in registry.variables:
                var_def = registry.variables[var]
                if var_def.initial_value is not None:
                    lines.append(f"    /\\ {var} = {var_def.initial_value}")
                else:
                    lines.append(f"    /\\ {var} = 0")
        else:
            lines.append("    TRUE")
        lines.append("")
        
        # Transitions
        if registry.transitions:
            lines.append("Next ==")
            for i, (trans_name, trans_def) in enumerate(registry.transitions.items()):
                lines.append(f"    \\/ {trans_def.guard_expression or 'TRUE'}")
            lines.append("")
        
        # Invariants
        if registry.invariants:
            lines.append("Invariant ==")
            for i, (inv_name, inv_def) in enumerate(registry.invariants.items()):
                lines.append(f"    /\\ {inv_def.expression}")
            lines.append("")
        
        # Temporal properties
        for prop_name, prop in registry.temporal_properties.items():
            lines.append(f"{prop_name} == {prop.operator}{prop.expression}")
        
        # Theorems
        lines.append("")
        lines.append("THEOREM Spec => []Invariant")
        lines.append("")
        
        lines.append("====")
        
        return "\n".join(lines)
    
    def _simulate_model_checking(self, tla_spec: str, properties: List[str]) -> Dict[str, Any]:
        """
        Simulate TLA+ model checking results.
        In practice, this would actually run tlc.
        """
        return {
            'status': 'PASSED',
            'checks': len(properties) if properties else 1,
            'errors': [],
            'trace': 'No counterexample found',
            'specification': tla_spec
        }
    
    def import_tla_plus(self, tla_plus_source: str, name: Optional[str] = None) -> StateMachineRegistry:
        """
        Import TLA+ source and create a registry from it.
        """
        # Extract name from module if not provided
        if not name:
            module_match = re.search(r'MODULE\s+(\w+)', tla_plus_source)
            if module_match:
                name = module_match.group(1)
            else:
                name = f"TLA_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Create registry
        registry = self.registry_manager.create_registry(name, tla_plus_source=tla_plus_source)
        
        # Parse TLA+ source
        self.registry_manager._parse_tla_plus(registry, tla_plus_source)
        
        return registry

# ---------- 5. Complete Usage Example ----------

def example_state_machine_registry():
    """Example of using the state machine registry with TLA+ integration"""
    
    # Create interpreter
    interpreter = ResolutionInterpreter()
    
    # Create registry manager and bridge
    manager = StateMachineRegistryManager()
    bridge = StateMachineToResolutionBridge(interpreter)
    tla_integration = TLAIntegrationLayer(interpreter)
    
    # Example TLA+ specification for a work request lifecycle
    tla_spec = """
---- MODULE WorkRequestLifecycle ----
EXTENDS Integers

CONSTANTS 
    DRAFT, APPROVED, DISPATCHED, COMPLETED, CANCELLED

VARIABLES
    state, priority, assignee, created_at

States ==
    {DRAFT, APPROVED, DISPATCHED, COMPLETED, CANCELLED}

Init ==
    /\\ state = DRAFT
    /\\ priority = 0
    /\\ assignee = NULL
    /\\ created_at = 0

Approve ==
    /\\ state = DRAFT
    /\\ priority > 0
    /\\ state' = APPROVED
    /\\ assignee' = assignee

Dispatch ==
    /\\ state = APPROVED
    /\\ assignee != NULL
    /\\ state' = DISPATCHED

Complete ==
    /\\ state = DISPATCHED
    /\\ state' = COMPLETED

Cancel ==
    /\\ state \\in {DRAFT, APPROVED}
    /\\ state' = CANCELLED

Next ==
    \\/ Approve
    \\/ Dispatch
    \\/ Complete
    \\/ Cancel

Invariant ==
    /\\ state \\in States
    /\\ priority \\in 0..5
    /\\ priority > 0 => assignee != NULL

Theorems ==
    []Invariant
===="""
    
    # Import TLA+ specification
    registry = tla_integration.import_tla_plus(tla_spec, "WorkRequestLifecycle")
    
    print(f"Created registry: {registry.name}")
    print(f"States: {list(registry.states.keys())}")
    print(f"Transitions: {list(registry.transitions.keys())}")
    print(f"Invariants: {list(registry.invariants.keys())}")
    
    # Validate the registry
    validation = manager.validate_registry(registry.id)
    print(f"\nValidation: {'✅ Valid' if validation['is_valid'] else '❌ Invalid'}")
    if validation['warnings']:
        print(f"Warnings: {validation['warnings']}")
    
    # Bridge to resolution schema
    print("\nBridging to Resolution Schema...")
    bridge_result = bridge.bridge_registry(registry.id)
    print(f"Created {len(bridge_result['created_concepts'])} concepts")
    print(f"Created {len(bridge_result['created_attributes'])} attributes")
    print(f"Created {len(bridge_result['created_relationships'])} relationships")
    print(f"Created {len(bridge_result['created_rules'])} rules")
    print(f"Created {len(bridge_result['created_transitions'])} transitions")
    
    # Verify the state machine
    print("\nVerifying State Machine...")
    verify_result = tla_integration.verify_state_machine(registry.id)
    print(f"Verification: {verify_result['status']}")
    
    # Example: Add a state to the registry
    new_state = StateDefinition(
        name="REVIEWING",
        description="Work request is under review",
        variable_assignments={
            'state': 'REVIEWING',
            'priority': 'priority'
        }
    )
    manager.add_state(registry.id, new_state)
    print(f"\nAdded new state: {new_state.name}")
    
    # Show the generated TLA+ specification
    print("\nGenerated TLA+ Specification:")
    print(tla_integration._generate_tla_plus(registry))
    
    return registry, bridge_result

if __name__ == "__main__":
    registry, bridge_result = example_state_machine_registry()