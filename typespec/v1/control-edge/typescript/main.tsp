/**
 * nexus-control-edge — consolidated control-plane edge contract.
 *
 * Canonical surface for the AdonisJS control-plane edge
 * (adonisjs/nexus-control-edge). Hosts the control-plane REST services
 * (ui-tools live; tools-aggregator, knowledge-srv, semantics-srv,
 * terrain-srv, voyager-srv, tackle-srv, role-memory-srv land with their
 * migration waves).
 *
 * This contract is the conformance spec (D-2026-08-14-004 Phase A): the
 * edge validates its route table + request shapes against the emitted
 * OpenAPI at boot.
 */

import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Control Edge" })
namespace org.nexus.controledge;
