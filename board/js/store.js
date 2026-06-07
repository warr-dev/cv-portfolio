/**
 * Store — Data persistence layer for Priority Board.
 * Fetches from REST API, falls back to localStorage.
 */

const Store = {
  API_BASE: '/board/api',

  async load() {
    try {
      const res = await fetch(`${this.API_BASE}/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.projects) data.projects = [];
      return data;
    } catch (e) {
      console.warn('API unavailable, falling back to localStorage:', e.message);
      return this._loadLocal();
    }
  },

  async save(data) {
    try {
      const res = await fetch(`${this.API_BASE}/data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('API save failed, falling back to localStorage:', e.message);
      this._saveLocal(data);
    }
  },

  /** Sync a single project update via REST */
  async saveProject(project) {
    try {
      const res = await fetch(`${this.API_BASE}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          priority: project.priority,
          description: project.description,
          columns: project.columns,
        }),
      });
      return res.ok;
    } catch (e) {
      console.warn('Project save failed:', e.message);
      return false;
    }
  },

  /** Create a project via REST */
  async createProject(name, priority, description, columns) {
    try {
      const res = await fetch(`${this.API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, priority, description, columns }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Project create failed:', e.message);
      return null;
    }
  },

  /** Delete a project via REST */
  async deleteProject(id) {
    try {
      const res = await fetch(`${this.API_BASE}/projects/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (e) {
      console.warn('Project delete failed:', e.message);
      return false;
    }
  },

  /** Create a task via REST */
  async createTask(projectId, task) {
    try {
      const res = await fetch(`${this.API_BASE}/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Task create failed:', e.message);
      return null;
    }
  },

  /** Update a task via REST */
  async updateTask(id, updates) {
    try {
      const res = await fetch(`${this.API_BASE}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Task update failed:', e.message);
      return null;
    }
  },

  /** Delete a task via REST */
  async deleteTask(id) {
    try {
      const res = await fetch(`${this.API_BASE}/tasks/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (e) {
      console.warn('Task delete failed:', e.message);
      return false;
    }
  },

  /** Batch reorder tasks (after drag-and-drop) */
  async reorderTasks(updates) {
    try {
      const res = await fetch(`${this.API_BASE}/tasks/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: updates }),
      });
      return res.ok;
    } catch (e) {
      console.warn('Task reorder failed:', e.message);
      return false;
    }
  },

  /** Export full data as JSON download (client-side) */
  exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `priority-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Import from uploaded JSON file */
  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.projects || !Array.isArray(data.projects)) {
            reject(new Error('Invalid format: missing "projects" array'));
            return;
          }
          resolve(data);
        } catch (err) { reject(new Error('Invalid JSON file')); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  // ── localStorage fallback ──
  STORAGE_KEY: 'priority-board-data',

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { projects: [] };
  },

  _saveLocal(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  },
};
