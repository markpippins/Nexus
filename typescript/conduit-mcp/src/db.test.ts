/**
 * Tests for createNextTickets terminal-plan guard on the TypeScript side.
 *
 * Mirrors the Python test_guard.py tests — verifies the guard blocks
 * ticket spawning when the plan already has a terminal receipt
 * (REVIEW_PASS, BLOCK, PLAN_BLOCK).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

import { initDb, createNextTickets, cancelTicketsByPlan } from './db';
import type Database from 'better-sqlite3';

let _db: Database.Database;
let _tmpDir: string;

beforeEach(() => {
  _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
  _db = initDb(_tmpDir);
});

afterEach(() => {
  if (_db) _db.close();
  if (_tmpDir) fs.rmSync(_tmpDir, { recursive: true, force: true });
});

function addReceipt(planId: string, type: string): void {
  const now = new Date().toISOString();
  _db.prepare(
    `INSERT INTO receipts (id, plan_id, type, agent_role, created_at)
     VALUES (?, ?, ?, 'test', ?)`
  ).run(`rec-${type}-${Date.now()}`, planId, type, now);
}

function addPlan(planId: string): void {
  const now = new Date().toISOString();
  _db.prepare(
    `INSERT INTO plans (id, file_name, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(planId, `${planId}.md`, `Plan ${planId}`, now, now);
}

function addTicket(planId: string, role: string, status: string): string {
  const now = new Date().toISOString();
  const id = `ticket-${planId}-${role}-${Date.now()}`;
  _db.prepare(
    `INSERT INTO tickets (id, plan_id, role, status, owner, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, planId, role, status, role, now);
  return id;
}

describe('createNextTickets guard', () => {

  test('blocks critic completed on REVIEW_PASS plan', () => {
    addPlan('p1');
    addReceipt('p1', 'REVIEW_PASS');
    const result = createNextTickets('p1', 'critic', 'completed');
    expect(result).toBe(0);
  });

  test('blocks critic completed on BLOCK plan', () => {
    addPlan('p1');
    addReceipt('p1', 'BLOCK');
    const result = createNextTickets('p1', 'critic', 'completed');
    expect(result).toBe(0);
  });

  test('blocks critic completed on PLAN_BLOCK plan', () => {
    addPlan('p1');
    addReceipt('p1', 'PLAN_BLOCK');
    const result = createNextTickets('p1', 'critic', 'completed');
    expect(result).toBe(0);
  });

  test('allows normal critic completed flow', () => {
    addPlan('p1');
    // No terminal receipt — should spawn builder
    const result = createNextTickets('p1', 'critic', 'completed');
    expect(result).toBeGreaterThan(0);
  });

  test('scopes guard to correct plan', () => {
    addPlan('p1');
    addPlan('p2');
    addReceipt('p1', 'REVIEW_PASS');  // terminal on p1
    // p2 has no terminal receipt — should spawn
    const result = createNextTickets('p2', 'critic', 'completed');
    expect(result).toBeGreaterThan(0);
  });

  test('allows reviewer failed → builder when no terminal receipt', () => {
    addPlan('p1');
    const result = createNextTickets('p1', 'reviewer', 'failed');
    expect(result).toBeGreaterThan(0);
  });

  test('blocks reviewer failed on REVIEW_PASS plan', () => {
    addPlan('p1');
    addReceipt('p1', 'REVIEW_PASS');
    const result = createNextTickets('p1', 'reviewer', 'failed');
    expect(result).toBe(0);
  });

  test('blocks planner completed on REVIEW_PASS plan', () => {
    addPlan('p1');
    addReceipt('p1', 'REVIEW_PASS');
    const result = createNextTickets('p1', 'planner', 'completed');
    expect(result).toBe(0);
  });

  test('blocks reviewer failed on BLOCK plan', () => {
    addPlan('p1');
    addReceipt('p1', 'BLOCK');
    const result = createNextTickets('p1', 'reviewer', 'failed');
    expect(result).toBe(0);
  });

  test('does not interfere with mapping that already returns 0 (builder failed)', () => {
    addPlan('p1');
    const result = createNextTickets('p1', 'builder', 'failed');
    expect(result).toBe(0);
  });

});

describe('cancelTicketsByPlan', () => {

  function getTicketStatus(id: string): string | undefined {
    const row = _db.prepare('SELECT status FROM tickets WHERE id = ?').get(id) as { status: string } | undefined;
    return row?.status;
  }

  function getClosureReason(id: string): string | null {
    const row = _db.prepare('SELECT closure_reason FROM tickets WHERE id = ?').get(id) as { closure_reason: string | null } | undefined;
    return row?.closure_reason ?? null;
  }

  test('cancels open tickets for a plan', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'open');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(1);
    expect(getTicketStatus(id)).toBe('cancelled');
    expect(getClosureReason(id)).toBe('plan_deleted');
  });

  test('cancels claimed tickets for a plan', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'claimed');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(1);
    expect(getTicketStatus(id)).toBe('cancelled');
  });

  test('cancels stale tickets for a plan', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'stale');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(1);
    expect(getTicketStatus(id)).toBe('cancelled');
  });

  test('does not cancel completed tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'completed');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('completed');
  });

  test('does not cancel failed tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'failed');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('failed');
  });

  test('does not cancel expired tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'expired');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('expired');
  });

  test('does not cancel superseded tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'superseded');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('superseded');
  });

  test('does not cancel cancelled tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'cancelled');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('cancelled');
  });

  test('does not cancel abandoned tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'abandoned');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
    expect(getTicketStatus(id)).toBe('abandoned');
  });

  test('only cancels tickets for the specified plan, not other plans', () => {
    addPlan('p1');
    addPlan('p2');
    const id1 = addTicket('p1', 'builder', 'open');
    const id2 = addTicket('p2', 'builder', 'open');

    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(1);
    expect(getTicketStatus(id1)).toBe('cancelled');
    expect(getTicketStatus(id2)).toBe('open');  // p2 unaffected
  });

  test('returns 0 for plan with no tickets', () => {
    addPlan('p1');
    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(0);
  });

  test('cancels multiple tickets for the same plan', () => {
    addPlan('p1');
    const id1 = addTicket('p1', 'builder', 'open');
    const id2 = addTicket('p1', 'reviewer', 'open');
    const id3 = addTicket('p1', 'critic', 'claimed');

    const count = cancelTicketsByPlan('p1', 'plan_deleted');
    expect(count).toBe(3);
    expect(getTicketStatus(id1)).toBe('cancelled');
    expect(getTicketStatus(id2)).toBe('cancelled');
    expect(getTicketStatus(id3)).toBe('cancelled');
  });

  test('sets closed_at and last_activity on cancelled tickets', () => {
    addPlan('p1');
    const id = addTicket('p1', 'builder', 'open');

    cancelTicketsByPlan('p1', 'plan_deleted');

    const row = _db.prepare('SELECT closed_at, last_activity FROM tickets WHERE id = ?').get(id) as { closed_at: string; last_activity: string };
    expect(row.closed_at).toBeTruthy();
    expect(row.last_activity).toBeTruthy();
    expect(new Date(row.closed_at).getTime()).not.toBeNaN();
  });

});
