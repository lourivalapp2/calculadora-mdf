import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SavedProject } from '../components/ProjectsModal';

const LOCAL_STORAGE_KEY = 'mdf_saved_projects_v1';

// Obtain environment variables for Supabase connection (with fallback credentials)
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://wqchmksdvuvzbyzgpouy.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_TDeVQJ5ohTUlESN9Inf-Rw_uNYSG8UR';

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
  const localProjects = getLocalProjects().filter(p => p.id !== '__global_analysis_scenarios__');

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
      const filteredRows = data.filter(row => 
        row.id !== '__global_analysis_scenarios__' && 
        row.id !== '__global_ml_library__' &&
        row.id !== '__global_purchase_library__'
      );

      const cloudProjects: SavedProject[] = filteredRows.map(row => {
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
 * Fetches Mercado Livre products library from Supabase Cloud with fallback to localStorage
 */
export const fetchMlLibraryFromCloud = async (): Promise<any[]> => {
  const LOCAL_ML_KEY = 'mdf-ml-library-v1';
  let localItems: any[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_ML_KEY);
    if (raw) localItems = JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler biblioteca ML local:', e);
  }

  if (!isSupabaseConfigured() || !supabase) {
    return localItems;
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', '__global_ml_library__')
      .single();

    if (error || !data) {
      return localItems;
    }

    const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
    const cloudItems = parsedData?.items || localItems;
    try {
      localStorage.setItem(LOCAL_ML_KEY, JSON.stringify(cloudItems));
    } catch (e) {}
    return cloudItems;
  } catch (e) {
    return localItems;
  }
};

/**
 * Saves Mercado Livre products library array to Supabase Cloud and syncs to localStorage
 */
export const saveMlLibraryToCloud = async (items: any[]): Promise<boolean> => {
  const LOCAL_ML_KEY = 'mdf-ml-library-v1';
  try {
    localStorage.setItem(LOCAL_ML_KEY, JSON.stringify(items));
  } catch (e) {}

  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase.from('projects').upsert(
      {
        id: '__global_ml_library__',
        name: 'Biblioteca de Produtos Mercado Livre',
        updated_at: new Date().toISOString(),
        data: { items },
      },
      { onConflict: 'id' }
    );
    return !error;
  } catch (e) {
    return false;
  }
};

/**
 * Fetches Purchase Products library from Supabase Cloud with fallback to localStorage
 */
export const fetchPurchaseLibraryFromCloud = async (): Promise<any[]> => {
  const LOCAL_PURCHASE_KEY = 'mdf-purchase-library-v1';
  let localItems: any[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_PURCHASE_KEY);
    if (raw) localItems = JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler biblioteca de compras local:', e);
  }

  if (!isSupabaseConfigured() || !supabase) {
    return localItems;
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', '__global_purchase_library__')
      .single();

    if (error || !data) {
      return localItems;
    }

    const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
    const cloudItems = parsedData?.items || localItems;
    try {
      localStorage.setItem(LOCAL_PURCHASE_KEY, JSON.stringify(cloudItems));
    } catch (e) {}
    return cloudItems;
  } catch (e) {
    return localItems;
  }
};

/**
 * Saves Purchase Products library array to Supabase Cloud and syncs to localStorage
 */
export const savePurchaseLibraryToCloud = async (items: any[]): Promise<boolean> => {
  const LOCAL_PURCHASE_KEY = 'mdf-purchase-library-v1';
  try {
    localStorage.setItem(LOCAL_PURCHASE_KEY, JSON.stringify(items));
  } catch (e) {}

  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase.from('projects').upsert(
      {
        id: '__global_purchase_library__',
        name: 'Biblioteca de Produtos para Compra',
        updated_at: new Date().toISOString(),
        data: { items },
      },
      { onConflict: 'id' }
    );
    return !error;
  } catch (e) {
    return false;
  }
};


/**
 * Fetches saved analysis scenarios from Supabase Cloud with fallback to localStorage
 */
export const fetchScenariosFromCloud = async (): Promise<any[]> => {
  const LOCAL_SCENARIOS_KEY = 'mdf-analysis-scenarios-v1';
  let localScenarios: any[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_SCENARIOS_KEY);
    if (raw) localScenarios = JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler cenários locais:', e);
  }

  if (!isSupabaseConfigured() || !supabase) {
    return localScenarios;
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', '__global_analysis_scenarios__')
      .single();

    if (error || !data) {
      return localScenarios;
    }

    const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
    const cloudScenarios = parsedData?.scenarios || localScenarios;
    try {
      localStorage.setItem(LOCAL_SCENARIOS_KEY, JSON.stringify(cloudScenarios));
    } catch (e) {}
    return cloudScenarios;
  } catch (e) {
    return localScenarios;
  }
};

/**
 * Saves analysis scenarios array to Supabase Cloud and syncs to localStorage
 */
export const saveScenariosToCloud = async (scenarios: any[]): Promise<boolean> => {
  const LOCAL_SCENARIOS_KEY = 'mdf-analysis-scenarios-v1';
  try {
    localStorage.setItem(LOCAL_SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch (e) {}

  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase.from('projects').upsert(
      {
        id: '__global_analysis_scenarios__',
        name: 'Cenários de Análise Salvos',
        updated_at: new Date().toISOString(),
        data: { scenarios },
      },
      { onConflict: 'id' }
    );
    return !error;
  } catch (e) {
    return false;
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
