import type { Program, ProgramDay } from "./types";
import { uuid } from "./uuid";
import { getDatabase } from "./db/helpers";

// --------------- Programs ---------------

export async function createProgram(
  name: string,
  description = ""
): Promise<Program> {
  const database = await getDatabase();
  const id = uuid();
  const now = Date.now();
  await database.runAsync(
    "INSERT INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, ?, ?)",
    [id, name, description, now, now]
  );
  return {
    id,
    name,
    description,
    is_active: false,
    current_day_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function getPrograms(): Promise<Program[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    name: string;
    description: string;
    is_active: number;
    is_starter: number;
    current_day_id: string | null;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
  }>(
    "SELECT * FROM programs WHERE deleted_at IS NULL ORDER BY is_active DESC, is_starter ASC, updated_at DESC"
  );
  return rows.map((r) => ({ ...r, is_active: r.is_active === 1, is_starter: r.is_starter === 1 }));
}

export async function getProgramById(id: string): Promise<Program | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string;
    name: string;
    description: string;
    is_active: number;
    is_starter: number;
    current_day_id: string | null;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
  }>("SELECT * FROM programs WHERE id = ? AND deleted_at IS NULL", [id]);
  if (!row) return null;
  return { ...row, is_active: row.is_active === 1, is_starter: row.is_starter === 1 };
}

export async function updateProgram(
  id: string,
  name: string,
  description: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE programs SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    [name, description, Date.now(), id]
  );
}

export async function softDeleteProgram(id: string): Promise<void> {
  const database = await getDatabase();
  const prog = await database.getFirstAsync<{ is_starter: number }>(
    "SELECT is_starter FROM programs WHERE id = ?",
    [id]
  );
  if (prog?.is_starter === 1) return;
  await database.runAsync(
    "UPDATE programs SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ? AND is_starter = 0",
    [Date.now(), Date.now(), id]
  );
}

export async function getActiveProgram(): Promise<Program | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string;
    name: string;
    description: string;
    is_active: number;
    is_starter: number;
    current_day_id: string | null;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
  }>("SELECT * FROM programs WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1");
  if (!row) return null;
  return { ...row, is_active: true, is_starter: row.is_starter === 1 };
}

export async function activateProgram(id: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE programs SET is_active = 0, updated_at = ? WHERE is_active = 1",
      [Date.now()]
    );
    const days = await database.getAllAsync<{ id: string }>(
      "SELECT id FROM program_days WHERE program_id = ? ORDER BY position ASC LIMIT 1",
      [id]
    );
    const first = days.length > 0 ? days[0].id : null;
    // Preserve current_day_id only if it still exists in program_days
    const prog = await database.getFirstAsync<{ current_day_id: string | null }>(
      "SELECT current_day_id FROM programs WHERE id = ?",
      [id]
    );
    let dayId = first;
    if (prog?.current_day_id) {
      const exists = await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM program_days WHERE id = ? AND program_id = ?",
        [prog.current_day_id, id]
      );
      if (exists) dayId = prog.current_day_id;
    }
    await database.runAsync(
      "UPDATE programs SET is_active = 1, current_day_id = ?, updated_at = ? WHERE id = ?",
      [dayId, Date.now(), id]
    );
  });
}

export async function deactivateProgram(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE programs SET is_active = 0, updated_at = ? WHERE id = ?",
    [Date.now(), id]
  );
}

export async function getProgramDays(programId: string): Promise<ProgramDay[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    program_id: string;
    template_id: string | null;
    position: number;
    label: string;
    template_name: string | null;
  }>(
    `SELECT pd.*, wt.name AS template_name
     FROM program_days pd
     LEFT JOIN workout_templates wt ON pd.template_id = wt.id
     WHERE pd.program_id = ?
     ORDER BY pd.position ASC`,
    [programId]
  );
  return rows.map((r) => ({
    ...r,
    template_name: r.template_name ?? undefined,
  }));
}

export async function getProgramDayCount(programId: string): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM program_days WHERE program_id = ?",
    [programId]
  );
  return row?.count ?? 0;
}

export async function addProgramDay(
  programId: string,
  templateId: string,
  position: number,
  label = ""
): Promise<ProgramDay> {
  const database = await getDatabase();
  const id = uuid();
  await database.runAsync(
    "INSERT INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
    [id, programId, templateId, position, label]
  );
  await database.runAsync(
    "UPDATE programs SET updated_at = ? WHERE id = ?",
    [Date.now(), programId]
  );
  return { id, program_id: programId, template_id: templateId, position, label };
}

export async function removeProgramDay(id: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ program_id: string }>(
    "SELECT program_id FROM program_days WHERE id = ?",
    [id]
  );
  if (!row) return;
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM program_days WHERE id = ?", [id]);
    const prog = await database.getFirstAsync<{ current_day_id: string | null }>(
      "SELECT current_day_id FROM programs WHERE id = ?",
      [row.program_id]
    );
    if (prog?.current_day_id === id) {
      const first = await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM program_days WHERE program_id = ? ORDER BY position ASC LIMIT 1",
        [row.program_id]
      );
      await database.runAsync(
        "UPDATE programs SET current_day_id = ?, updated_at = ? WHERE id = ?",
        [first?.id ?? null, Date.now(), row.program_id]
      );
    }
    const ordered = await database.getAllAsync<{ id: string }>(
      "SELECT id FROM program_days WHERE program_id = ? ORDER BY position ASC",
      [row.program_id]
    );
    for (let i = 0; i < ordered.length; i++) {
      await database.runAsync(
        "UPDATE program_days SET position = ? WHERE id = ?",
        [i, ordered[i].id]
      );
    }
    await database.runAsync(
      "UPDATE programs SET updated_at = ? WHERE id = ?",
      [Date.now(), row.program_id]
    );
  });
}

export async function reorderProgramDays(
  programId: string,
  orderedIds: string[]
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await database.runAsync(
        "UPDATE program_days SET position = ? WHERE id = ? AND program_id = ?",
        [i, orderedIds[i], programId]
      );
    }
    await database.runAsync(
      "UPDATE programs SET updated_at = ? WHERE id = ?",
      [Date.now(), programId]
    );
  });
}

export async function advanceProgram(
  programId: string,
  dayId: string,
  sessionId: string
): Promise<{ wrapped: boolean; cycle: number }> {
  const database = await getDatabase();
  const now = Date.now();

  const prog = await database.getFirstAsync<{ deleted_at: number | null }>(
    "SELECT deleted_at FROM programs WHERE id = ?",
    [programId]
  );
  if (!prog || prog.deleted_at !== null) {
    return { wrapped: false, cycle: 0 };
  }

  let wrapped = false;
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO program_log (id, program_id, day_id, session_id, completed_at) VALUES (?, ?, ?, ?, ?)",
      [uuid(), programId, dayId, sessionId, now]
    );

    const days = await database.getAllAsync<{ id: string; position: number }>(
      "SELECT id, position FROM program_days WHERE program_id = ? ORDER BY position ASC",
      [programId]
    );
    const idx = days.findIndex((d) => d.id === dayId);
    if (idx === -1 || days.length === 0) {
      return;
    }
    const next = idx + 1 < days.length ? days[idx + 1] : days[0];
    wrapped = idx + 1 >= days.length;

    await database.runAsync(
      "UPDATE programs SET current_day_id = ?, updated_at = ? WHERE id = ?",
      [next.id, now, programId]
    );
  });

  const cycle = await getProgramCycleCount(programId);
  return { wrapped, cycle };
}

export async function getProgramCycleCount(programId: string): Promise<number> {
  const database = await getDatabase();
  const days = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM program_days WHERE program_id = ?",
    [programId]
  );
  if (!days || days.count === 0) return 0;
  const logs = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM program_log WHERE program_id = ?",
    [programId]
  );
  return Math.floor((logs?.count ?? 0) / days.count);
}

export async function getProgramHistory(
  programId: string,
  limit = 20
): Promise<{ session_id: string; day_label: string; template_name: string | null; completed_at: number }[]> {
  const database = await getDatabase();
  return database.getAllAsync<{ session_id: string; day_label: string; template_name: string | null; completed_at: number }>(
    `SELECT pl.session_id, pd.label AS day_label, wt.name AS template_name, pl.completed_at
     FROM program_log pl
     LEFT JOIN program_days pd ON pl.day_id = pd.id
     LEFT JOIN workout_templates wt ON pd.template_id = wt.id
     WHERE pl.program_id = ?
     ORDER BY pl.completed_at DESC
     LIMIT ?`,
    [programId, limit]
  );
}

export async function getSessionProgramDayId(sessionId: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ program_day_id: string | null }>(
    "SELECT program_day_id FROM workout_sessions WHERE id = ?",
    [sessionId]
  );
  return row?.program_day_id ?? null;
}

export async function getProgramDayById(dayId: string): Promise<(ProgramDay & { program_id: string }) | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string;
    program_id: string;
    template_id: string | null;
    position: number;
    label: string;
  }>("SELECT * FROM program_days WHERE id = ?", [dayId]);
  if (!row) return null;
  return row;
}

export async function getNextWorkout(): Promise<{
  program: Program;
  day: ProgramDay;
} | null> {
  const active = await getActiveProgram();
  if (!active || !active.current_day_id) return null;

  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string;
    program_id: string;
    template_id: string | null;
    position: number;
    label: string;
    template_name: string | null;
  }>(
    `SELECT pd.*, wt.name AS template_name
     FROM program_days pd
     LEFT JOIN workout_templates wt ON pd.template_id = wt.id
     WHERE pd.id = ?`,
    [active.current_day_id]
  );
  if (!row) return null;

  return {
    program: active,
    day: { ...row, template_name: row.template_name ?? undefined },
  };
}
