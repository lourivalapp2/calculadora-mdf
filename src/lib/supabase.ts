import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SavedProject } from '../components/ProjectsModal';

const LOCAL_STORAGE_KEY = 'mdf_saved_projects_v1';

// Obtain environment variables for Supabase connection
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Singleton client instance
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

/**
 * Checks if Supabase connection credentials are configured in environment
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabase);
};

/**
 * Reads local cached projects from localStorage
 */
export const getLocalProjects = (): SavedProject[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler projetos do localStorage:', e);
    return [];
  }
};

/**
 * Saves project array locally to localStorage
 */
export const saveLocalProjects = (projects: SavedProject[]): void => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Erro ao salvar projetos no localStorage:', e);
  }
};

/**
 * Fetches all saved projects from Supabase with automatic fallback to localStorage
 */
export const fetchProjectsFromCloud = async (): Promise<{
  projects: SavedProject[];
  isCloud: boolean;
  error?: string;
}> => {
  const localProjects = getLocalProjects();

  if (!isSupabaseConfigured() || !supabase) {
    return { projects: localProjects, isCloud: false };
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('Falha ao buscar projetos do Supabase. Usando cache local:', error.message);
      return { projects: localProjects, isCloud: false, error: error.message };
    }

    if (data) {
      const cloudProjects: SavedProject[] = data.map(row => {
        // If data column is a JSON object or stringified JSON
        const parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return {
          ...parsedData,
          id: row.id || parsedData.id,
          name: row.name || parsedData.name,
          updatedAt: row.updated_at || parsedData.updatedAt,
        };
      });

      // Synchronize local cache with latest cloud data
      saveLocalProjects(cloudProjects);
      return { projects: cloudProjects, isCloud: true };
    }

    return { projects: localProjects, isCloud: true };
  } catch (err: any) {
    console.error('Erro na requisição Supabase:', err);
    return { projects: localProjects, isCloud: false, error: err.message || 'Erro de conexão' };
  }
};

/**
 * Saves or updates a single project in Supabase and syncs to localStorage
 */
export const saveProjectToCloud = async (
  project: SavedProject
): Promise<{ success: boolean; isCloud: boolean; error?: string }> => {
  // Update local storage first for instant feedback
  const local = getLocalProjects();
  const index = local.findIndex(p => p.id === project.id);
  let updatedLocal: SavedProject[];
  if (index >= 0) {
    updatedLocal = [...local];
    updatedLocal[index] = project;
  } else {
    updatedLocal = [project, ...local];
  }
  saveLocalProjects(updatedLocal);

  if (!isSupabaseConfigured() || !supabase) {
    return { success: true, isCloud: false };
  }

  try {
    const { error } = await supabase.from('projects').upsert(
      {
        id: project.id,
        name: project.name,
        updated_at: project.updatedAt || new Date().toISOString(),
        data: project,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('Erro ao upsert no Supabase:', error);
      return { success: false, isCloud: true, error: error.message };
    }

    return { success: true, isCloud: true };
  } catch (err: any) {
    console.error('Erro ao salvar no Supabase:', err);
    return { success: false, isCloud: false, error: err.message || 'Erro de rede' };
  }
};

/**
 * Deletes a project from Supabase and removes it from localStorage
 */
export const deleteProjectFromCloud = async (
  projectId: string
): Promise<{ success: boolean; isCloud: boolean; error?: string }> => {
  // Remove from local storage
  const local = getLocalProjects();
  const filtered = local.filter(p => p.id !== projectId);
  saveLocalProjects(filtered);

  if (!isSupabaseConfigured() || !supabase) {
    return { success: true, isCloud: false };
  }

  try {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);

    if (error) {
      console.error('Erro ao deletar projeto do Supabase:', error);
      return { success: false, isCloud: true, error: error.message };
    }

    return { success: true, isCloud: true };
  } catch (err: any) {
    console.error('Erro de exclusão no Supabase:', err);
    return { success: false, isCloud: false, error: err.message || 'Erro de rede' };
  }
};
