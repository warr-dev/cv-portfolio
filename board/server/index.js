/**
 * Priority Board API — Express + SQLite
 * Serves REST API + static frontend + Swagger docs
 * DB at ~/.local/share/priority-board/data.db (outside repo)
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { homedir } from 'os';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, '..');
const PORT = process.env.PORT || 3099;

// ─── SQLite — DB outside repo ────────────────────────────────────

const DB_DIR = process.env.DB_DIR || join(homedir(), '.local', 'share', 'priority-board');
const DB_FILE = join(DB_DIR, 'data.db');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

// ─── Initialize DB ───────────────────────────────────────────────

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    priority   TEXT NOT NULL DEFAULT 'high' CHECK(priority IN ('critical','high','medium','low')),
    description TEXT DEFAULT '',
    columns    TEXT NOT NULL DEFAULT '["Backlog","To Do","In Progress","Done"]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority    TEXT DEFAULT '',
    assignee    TEXT DEFAULT '',
    column_name TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
`);

// ─── Prepared statements ────────────────────────────────────────

const stmts = {
  getAllProjects:         db.prepare('SELECT * FROM projects ORDER BY created_at ASC'),
  getProjectById:         db.prepare('SELECT * FROM projects WHERE id = ?'),
  insertProject:          db.prepare('INSERT INTO projects (id, name, priority, description, columns, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  updateProject:          db.prepare('UPDATE projects SET name = ?, priority = ?, description = ?, columns = ? WHERE id = ?'),
  deleteProject:          db.prepare('DELETE FROM projects WHERE id = ?'),
  getTasksByProject:      db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order ASC'),
  getTaskById:            db.prepare('SELECT * FROM tasks WHERE id = ?'),
  insertTask:             db.prepare('INSERT INTO tasks (id, project_id, title, description, priority, assignee, column_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateTask:             db.prepare('UPDATE tasks SET title = ?, description = ?, priority = ?, assignee = ?, column_name = ? WHERE id = ?'),
  deleteTask:             db.prepare('DELETE FROM tasks WHERE id = ?'),
  deleteTasksByProject:   db.prepare('DELETE FROM tasks WHERE project_id = ?'),
  getMaxOrder:            db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE project_id = ? AND column_name = ?'),
  reorderTask:            db.prepare('UPDATE tasks SET column_name = ?, sort_order = ? WHERE id = ?'),
  deleteAllProjects:      db.prepare('DELETE FROM projects'),
  deleteAllTasks:         db.prepare('DELETE FROM tasks'),
};

// ─── Helpers ─────────────────────────────────────────────────────

function rowToProject(row) {
  return { id: row.id, name: row.name, priority: row.priority, description: row.description || '', columns: JSON.parse(row.columns), tasks: [], createdAt: row.created_at };
}

function rowToTask(row) {
  return { id: row.id, title: row.title, description: row.description || '', priority: row.priority || '', assignee: row.assignee || '', column: row.column_name, order: row.sort_order, createdAt: row.created_at };
}

function hydrateProject(row) {
  const project = rowToProject(row);
  project.tasks = stmts.getTasksByProject.all(row.id).map(rowToTask);
  return project;
}

function fullData() {
  return { projects: stmts.getAllProjects.all().map(hydrateProject) };
}

// ─── Migration from board.json ──────────────────────────────────

const OLD_DATA_FILE = join(__dirname, 'data', 'board.json');
function migrateIfNeeded() {
  if (stmts.getAllProjects.all().length > 0) return;
  if (!existsSync(OLD_DATA_FILE)) return;

  console.log('Migrating from board.json...');
  const oldData = JSON.parse(readFileSync(OLD_DATA_FILE, 'utf-8'));

  const tx = db.transaction(() => {
    for (const project of (oldData.projects || [])) {
      stmts.insertProject.run(project.id, project.name, project.priority || 'high', project.description || '', JSON.stringify(project.columns || ['Backlog','To Do','In Progress','Done']), project.createdAt || Date.now());
      for (const task of (project.tasks || [])) {
        stmts.insertTask.run(task.id, project.id, task.title, task.description || '', task.priority || '', task.assignee || '', task.column || 'Backlog', task.order || 0, task.createdAt || Date.now());
      }
    }
  });
  tx();
  console.log(`Migrated ${oldData.projects?.length || 0} projects.`);
}

migrateIfNeeded();

// ─── Express app ─────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Swagger / OpenAPI ──────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Priority Board API',
      version: '1.0.0',
      description: `REST API for the Priority Board — Trello/Jira-like project & task manager with priority levels.\nStored in SQLite at \`~/.local/share/priority-board/data.db\`\n\n**Base URL:** \`/api\``,
      contact: { name: 'Warrbot' },
    },
    servers: [{ url: '/api', description: 'API base path' }],
    tags: [
      { name: 'Data', description: 'Bulk data operations' },
      { name: 'Projects', description: 'Project CRUD' },
      { name: 'Tasks', description: 'Task CRUD and reordering' },
    ],
    components: {
      schemas: {
        Priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        Project: {
          type: 'object', required: ['id', 'name', 'priority'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            priority: { $ref: '#/components/schemas/Priority' },
            description: { type: 'string' },
            columns: { type: 'array', items: { type: 'string' } },
            tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
            createdAt: { type: 'integer' },
          },
        },
        Task: {
          type: 'object', required: ['id', 'title'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', nullable: true },
            assignee: { type: 'string' },
            column: { type: 'string' },
            order: { type: 'integer' },
            createdAt: { type: 'integer' },
          },
        },
        BoardData: {
          type: 'object', required: ['projects'],
          properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } },
        },
        Error: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  },
  apis: [join(__dirname, 'index.js')],
});

// ─── API Routes ──────────────────────────────────────────────────

/**
 * @openapi
 * /data:
 *   get:
 *     tags: [Data]
 *     summary: Get full board data
 *     responses:
 *       200:
 *         description: All projects with tasks
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BoardData' }
 */
app.get('/api/data', (req, res) => res.json(fullData()));

/**
 * @openapi
 * /data:
 *   put:
 *     tags: [Data]
 *     summary: Replace all board data (bulk import)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BoardData' }
 *     responses:
 *       200:
 *         description: Data saved
 *       400:
 *         description: Invalid format
 */
app.put('/api/data', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.projects)) {
    return res.status(400).json({ error: 'Body must contain a "projects" array' });
  }
  const tx = db.transaction(() => {
    stmts.deleteAllTasks.run();
    stmts.deleteAllProjects.run();
    for (const project of body.projects) {
      stmts.insertProject.run(project.id, project.name, project.priority || 'high', project.description || '', JSON.stringify(project.columns || ['Backlog','To Do','In Progress','Done']), project.createdAt || Date.now());
      for (const task of (project.tasks || [])) {
        stmts.insertTask.run(task.id, project.id, task.title, task.description || '', task.priority || '', task.assignee || '', task.column || 'Backlog', task.order || 0, task.createdAt || Date.now());
      }
    }
  });
  tx();
  res.json({ ok: true, count: body.projects.length });
});

// ── Projects ─────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  res.json(stmts.getAllProjects.all().map(hydrateProject));
});

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get single project with tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project
 *       404:
 *         description: Not found
 */
app.get('/api/projects/:id', (req, res) => {
  const row = stmts.getProjectById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(hydrateProject(row));
});

/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               priority: { $ref: '#/components/schemas/Priority' }
 *               description: { type: string }
 *               columns: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Name required
 */
app.post('/api/projects', (req, res) => {
  const { name, priority = 'high', description = '', columns } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const cols = columns && columns.length > 0 ? columns : ['Backlog', 'To Do', 'In Progress', 'Done'];
  stmts.insertProject.run(id, name.trim(), priority, description, JSON.stringify(cols), createdAt);
  res.status(201).json(rowToProject(stmts.getProjectById.get(id)));
});

/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     tags: [Projects]
 *     summary: Update a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               priority: { $ref: '#/components/schemas/Priority' }
 *               description: { type: string }
 *               columns: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.put('/api/projects/:id', (req, res) => {
  const row = stmts.getProjectById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  const { name, priority, description, columns } = req.body;
  stmts.updateProject.run(
    name !== undefined ? name.trim() : row.name,
    priority !== undefined ? priority : row.priority,
    description !== undefined ? description : (row.description || ''),
    columns !== undefined && columns.length > 0 ? JSON.stringify(columns) : row.columns,
    req.params.id
  );
  if (columns && columns.length > 0) {
    const orphanSql = `UPDATE tasks SET column_name = ? WHERE project_id = ? AND column_name NOT IN (${columns.map(() => '?').join(',')})`;
    db.prepare(orphanSql).run(columns[0], req.params.id, ...columns);
  }
  res.json(hydrateProject(stmts.getProjectById.get(req.params.id)));
});

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete a project and all its tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
app.delete('/api/projects/:id', (req, res) => {
  const row = stmts.getProjectById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  stmts.deleteTasksByProject.run(req.params.id);
  stmts.deleteProject.run(req.params.id);
  res.json({ ok: true });
});

// ── Tasks ────────────────────────────────────────────────────────

/**
 * @openapi
 * /projects/{projectId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task in a project
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, column]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, nullable: true }
 *               assignee: { type: string }
 *               column: { type: string }
 *     responses:
 *       201:
 *         description: Created
 *       404:
 *         description: Project not found
 */
app.post('/api/projects/:projectId/tasks', (req, res) => {
  const project = stmts.getProjectById.get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { title, description = '', priority = '', assignee = '', column } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  const cols = JSON.parse(project.columns);
  const targetCol = column || cols[0];
  if (!cols.includes(targetCol)) {
    return res.status(400).json({ error: `Invalid column "${targetCol}". Valid: ${cols.join(', ')}` });
  }
  const id = crypto.randomUUID();
  const nextOrder = stmts.getMaxOrder.get(req.params.projectId, targetCol).next;
  stmts.insertTask.run(id, req.params.projectId, title.trim(), description, priority, assignee, targetCol, nextOrder, Date.now());
  res.status(201).json(rowToTask(stmts.getTaskById.get(id)));
});

/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, nullable: true }
 *               assignee: { type: string }
 *               column: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.put('/api/tasks/:id', (req, res) => {
  const task = stmts.getTaskById.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { title, description, priority, assignee, column } = req.body;
  if (column) {
    const proj = stmts.getProjectById.get(task.project_id);
    if (proj && !JSON.parse(proj.columns).includes(column)) {
      return res.status(400).json({ error: `Invalid column "${column}"` });
    }
  }
  stmts.updateTask.run(
    title !== undefined ? title.trim() : task.title,
    description !== undefined ? description : (task.description || ''),
    priority !== undefined ? priority : (task.priority || ''),
    assignee !== undefined ? assignee : (task.assignee || ''),
    column !== undefined ? column : task.column_name,
    req.params.id
  );
  res.json(rowToTask(stmts.getTaskById.get(req.params.id)));
});

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
app.delete('/api/tasks/:id', (req, res) => {
  const task = stmts.getTaskById.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  stmts.deleteTask.run(req.params.id);
  res.json({ ok: true });
});

/**
 * @openapi
 * /tasks/reorder:
 *   patch:
 *     tags: [Tasks]
 *     summary: Batch reorder tasks after drag-and-drop
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tasks]
 *             properties:
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, column, order]
 *                   properties:
 *                     id: { type: string }
 *                     column: { type: string }
 *                     order: { type: integer }
 *     responses:
 *       200:
 *         description: Reordered
 */
app.patch('/api/tasks/reorder', (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: '"tasks" array is required' });
  }
  const tx = db.transaction(() => {
    for (const update of tasks) {
      stmts.reorderTask.run(update.column, update.order, update.id);
    }
  });
  tx();
  res.json({ ok: true, updated: tasks.length });
});

// ─── Swagger UI ─────────────────────────────────────────────────

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none } .swagger-ui { background: #0f1117 }',
  customSiteTitle: 'Priority Board API Docs',
}));

app.get('/api/openapi.json', (req, res) => res.json(swaggerSpec));

// ─── Static frontend ────────────────────────────────────────────

app.use(express.static(FRONTEND_DIR, {
  index: 'index.html',
  setHeaders: (res, path) => { if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache'); },
}));

// ─── Start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Priority Board API running on http://localhost:${PORT}`);
  console.log(`SQLite DB at: ${DB_FILE}`);
  console.log(`API docs: http://localhost:${PORT}/api/docs`);
});
