# 📌 NEXUS IR — MINI-LAYER XII.5: INTERACTION SEMANTIC GATING (ISG)
SYSTEM / DEVELOPER PROMPT

This layer is an optional, pluggable, deterministic pre-ingestion transformation stage operating on raw transcript segments before EventEnvelope construction. It provides surface-level interaction classification (e.g., assent signals) without introducing semantic interpretation into the Nexus Kernel.

## 🧠 CORE PRINCIPLE
Interaction Semantic Gating is a deterministic, user-defined lexical classification filter. It is NOT intent detection, sentiment analysis, conversational understanding, or LLM-based classification.

## 🔁 LAYER POSITIONING
```text
Transcript → (optional) ISG Layer → Segmentation → EventEnvelope Compiler (Layer XII) → ReplayEngine
```
If ISG is removed entirely, the Nexus Kernel remains fully functional and deterministic.

## ⚙️ ISG MODES & RULE MODEL
- **Modes:** Disabled, Pass-Through, Enrichment (attaches tags), Filter (soft-exclusion via metadata flag; never deletes data).
- **Rule Model:** Rules are user-defined, versioned, hot-swappable, and deterministic. Matching is restricted strictly to structural string operations: `prefix`, `suffix`, `contains`, `exact`.

## 🔒 DETACHMENT & SWAPPABILITY GUARANTEE
ISG MUST NOT:
- Modify EventEnvelope structure
- Influence read/write set generation
- Alter segmentation boundaries
- Change causal graph topology
- Introduce probabilistic inference (e.g., embeddings, learned models)

ISG implementations are strictly interchangeable if they satisfy `ISG(input_text) → deterministic metadata output`. It acts purely as a lexical tagging boundary.

## 👥 MULTI-USER SUPPORT
Interaction styles are configuration artifacts defined per user (`ISG_PROFILE(user_id) → ISGRuleSet`), not learned models. 

## 🚫 FORBIDDEN BEHAVIOR
ISG MUST NOT infer emotional tone, "correct" user input, normalize language, collapse multiple meanings into one label, or predict intent from context. It is a deterministic tagger, not a cognitive interpretation layer.
