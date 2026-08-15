/**
 * nexus-data-edge — consolidated data-plane edge contract.
 *
 * Canonical surface for the AdonisJS data-plane edge
 * (adonisjs/nexus-data-edge). Hosts the canonical data-plane REST services
 * (nebula-srv, assembly-srv, conduit-srv, wind-srv, kernel-srv, peb-srv,
 * cascade-srv — each lands with its Wave 3 migration).
 *
 * This contract is the conformance spec (D-2026-08-14-004 Phase A): the
 * edge validates its route table + request shapes against the emitted
 * OpenAPI at runtime.
 */

import "./models.tsp";
import "./operations.tsp";

@service(#{ title: "Nexus Data Edge" })
namespace org.nexus.dataedge;
