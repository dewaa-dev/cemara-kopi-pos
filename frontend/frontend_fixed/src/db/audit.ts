import { getDb } from "./database";
import { createBackup } from "./extras";

const uid = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export type AuditLog = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity: string | null;
  detail: string | null;
  created_at: string;
};

export async function logAudit(params: {
  user_id?: string;
  user_name?: string;
  action: string;
  entity?: string;
  detail?: string;
}) {
  const d = await getDb();
  await d.runAsync(
    "INSERT INTO audit_log (id,user_id,user_name,action,entity,detail,created_at) VALUES (?,?,?,?,?,?,?)",
    [
      `audit_${uid()}`,
      params.user_id ?? null,
      params.user_name ?? null,
      params.action,
      params.entity ?? null,
      params.detail ?? null,
      new Date().toISOString(),
    ]
  );
}

export async function listAuditLog(limit = 200): Promise<AuditLog[]> {
  const d = await getDb();
  return d.getAllAsync<AuditLog>(
    "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

export async function verifyAdminPin(
  pin: string
): Promise<{ ok: boolean; user?: { id: string; name: string } }> {
  const d = await getDb();
  const u = await d.getFirstAsync<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE role='admin' AND password=?",
    [pin]
  );
  return u ? { ok: true, user: u } : { ok: false };
}

export async function resetDemoData(params: {
  adminId: string;
  adminName: string;
  withBackup?: boolean;
}): Promise<{ ok: boolean; backupCreated?: boolean }> {
  let backupCreated = false;
  if (params.withBackup !== false) {
    try {
      await createBackup("manual");
      backupCreated = true;
    } catch {}
  }
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    await d.execAsync("DELETE FROM transaction_items");
    await d.execAsync("DELETE FROM transactions");
    await d.execAsync("DELETE FROM cash_flow");
    await d.execAsync("DELETE FROM draft_orders");
    await d.execAsync("DELETE FROM invoice_counters");
    await d.runAsync(
      "INSERT INTO audit_log (id,user_id,user_name,action,entity,detail,created_at) VALUES (?,?,?,?,?,?,?)",
      [
        `audit_${uid()}`,
        params.adminId,
        params.adminName,
        "reset_demo_data",
        "system",
        backupCreated ? "Reset with auto-backup" : "Reset without backup",
        new Date().toISOString(),
      ]
    );
  });
  return { ok: true, backupCreated };
}
