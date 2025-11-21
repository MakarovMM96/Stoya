import { ScreenFolder, User } from '../types';

// WARNING: Storing tokens in frontend code is insecure for production. 
// This is done here specifically for the requested demo functionality.
const YANDEX_TOKEN = "y0__xDfr5p5GO7dOyCuxPqgFdk1y0sSrcoV8UU-iJfbeZ5Axa2v";
const BASE_URL = "https://cloud-api.yandex.net/v1/disk/resources";

const APP_ROOT = "/Приложения/Стоя/Мой проект";
const MODERATOR_PATH = "/Приложения/Стоя/Мой проект/Модератор";
const CLIENTS_FOLDER_PATH = "/Приложения/Стоя/Мой проект/Клиенты";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to make authenticated requests with Retry logic
const yandexRequest = async (endpoint: string, options: RequestInit = {}, retries = 3): Promise<any> => {
  const headers = {
    'Authorization': `OAuth ${YANDEX_TOKEN}`,
    ...options.headers,
  };
  
  const url = `${BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle Locked (423) specifically with longer waits
    if (response.status === 423 && retries > 0) {
        const waitTime = 3000 + (Math.random() * 2000); // 3-5s wait
        console.warn(`Resource Locked (423) at ${endpoint}. Retrying in ${waitTime}ms... (${retries} left)`);
        await delay(waitTime);
        return yandexRequest(endpoint, options, retries - 1);
    }

    // Handle Rate Limit (429) or Server Error (5xx)
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
        const waitTime = 1500 * (4 - retries); // 1.5s, 3s, 4.5s
        console.warn(`Yandex API Status ${response.status} at ${endpoint}. Retrying in ${waitTime}ms... (${retries} left)`);
        await delay(waitTime);
        return yandexRequest(endpoint, options, retries - 1);
    }

    if (!response.ok) {
      // Log detailed error
      try {
          const errData = await response.json();
          console.error(`Yandex API Error [${response.status}] ${endpoint}:`, JSON.stringify(errData, null, 2));
      } catch (e) {
          console.error(`Yandex API Error [${response.status}] ${endpoint}:`, response.statusText);
      }

      if (response.status === 404) return null; // Resource not found
      return null;
    }

    // DELETE/PUT might return 204 No Content or 201 Created
    if (response.status === 204) return true;

    // If we expect JSON, parse it. Some PUT operations might return text or empty.
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    }
    return true;
  } catch (networkError) {
      console.error(`Network Error calling ${endpoint}:`, networkError);
      if (retries > 0) {
          await delay(2000);
          return yandexRequest(endpoint, options, retries - 1);
      }
      throw networkError;
  }
};

const ensureClientsDirectory = async () => {
    // Ensure Clients folder exists. 
    // We try to create it. If parent doesn't exist, we try to create parent first.
    const pathEncoded = encodeURIComponent(CLIENTS_FOLDER_PATH);
    
    const exists = await yandexRequest(`?path=${pathEncoded}`);
    if (exists) return;

    // Try to create directly
    const createRes = await yandexRequest(`?path=${pathEncoded}`, { method: 'PUT' });
    if (!createRes) {
        // Maybe parent is missing?
        const appRootEncoded = encodeURIComponent(APP_ROOT);
        const appRootExists = await yandexRequest(`?path=${appRootEncoded}`);
        if (!appRootExists) {
             await yandexRequest(`?path=${appRootEncoded}`, { method: 'PUT' });
        }
        // Try creating clients again
        await yandexRequest(`?path=${pathEncoded}`, { method: 'PUT' });
    }
};

export const getScreenFolders = async (): Promise<ScreenFolder[]> => {
  try {
    // URL Encode the path
    const path = encodeURIComponent(APP_ROOT);
    const data = await yandexRequest(`?path=${path}&limit=100`);

    if (!data || !data._embedded || !data._embedded.items) {
      return [];
    }

    const items: any[] = data._embedded.items;
    
    // Filter folders that look like "Экран X"
    const screens = items
      .filter((item: any) => item.type === 'dir' && item.name.startsWith('Экран'))
      .map((item: any) => {
        // Extract number from "Экран 1"
        const match = item.name.match(/Экран\s+(\d+)/i);
        const id = match ? parseInt(match[1], 10) : 0;
        return {
          name: item.name,
          path: item.path,
          screenId: id
        };
      })
      .sort((a, b) => a.screenId - b.screenId); // Sort by screen ID

    return screens;
  } catch (error) {
    console.error("Failed to fetch screens:", error);
    return [];
  }
};

/**
 * Fetches files specifically from a Screen folder (e.g. /Экран 1)
 */
export const fetchScreenContents = async (screenId: number) => {
    const path = `${APP_ROOT}/Экран ${screenId}`;
    const encodedPath = encodeURIComponent(path);
    const data = await yandexRequest(`?path=${encodedPath}&limit=1000`);
    if (data && data._embedded) return data._embedded.items || [];
    return [];
};

/**
 * Fetches files specifically from the Moderator folder
 */
export const fetchModeratorContents = async () => {
    const encodedPath = encodeURIComponent(MODERATOR_PATH);
    const data = await yandexRequest(`?path=${encodedPath}&limit=1000`);
    if (data && data._embedded) return data._embedded.items || [];
    return [];
};

/**
 * Fetches statistics for all screens:
 * 1. globalCounts: Total files actually inside "Экран X" folders (Limit 20).
 * 2. userFiles: List of files uploaded by the current user (checked in both Moderator and Screen folders).
 */
export const getScreenStats = async (userId: string): Promise<{
    globalCounts: Map<number, number>;
    userFiles: Map<number, {name: string, path: string}[]>;
}> => {
    try {
        const globalCounts = new Map<number, number>();
        const userFiles = new Map<number, {name: string, path: string}[]>();

        // 1. Get list of screens to know where to look
        const screens = await getScreenFolders();

        // 2. Fetch Moderator contents once (to find pending files)
        const moderatorFiles = await fetchModeratorContents();

        // 3. Iterate all screens and fetch their contents to count published files
        const screenPromises = screens.map(async (screen) => {
            const filesInScreen = await fetchScreenContents(screen.screenId);
            
            // Only count actual files (exclude subfolders if any)
            const fileCount = filesInScreen.filter((item: any) => item.type === 'file').length;
            globalCounts.set(screen.screenId, fileCount);

            // Find user files in this active screen folder
            const myActiveFiles = filesInScreen.filter((item: any) => 
                item.name.includes(`_User${userId}_`)
            ).map((item: any) => ({ name: item.name, path: item.path }));

            if (myActiveFiles.length > 0) {
                const existing = userFiles.get(screen.screenId) || [];
                userFiles.set(screen.screenId, [...existing, ...myActiveFiles]);
            }
        });

        // Wait for all screen folder scans
        await Promise.all(screenPromises);

        // 4. Add pending moderator files to userFiles map
        moderatorFiles.forEach((item: any) => {
            if (item.name.includes(`_User${userId}_`)) {
                // Extract Screen ID from filename "Screen1_..."
                const match = item.name.match(/^Screen(\d+)_/);
                if (match) {
                    const screenId = parseInt(match[1], 10);
                    const existing = userFiles.get(screenId) || [];
                    // Avoid duplicates if for some reason file is in both (rare race condition)
                    if (!existing.find(f => f.name === item.name)) {
                        existing.push({ name: item.name, path: item.path });
                        userFiles.set(screenId, existing);
                    }
                }
            }
        });

        return { globalCounts, userFiles };
    } catch (error) {
        console.error("Failed to get screen stats:", error);
        return { globalCounts: new Map(), userFiles: new Map() };
    }
};

export const deleteResource = async (path: string): Promise<boolean> => {
    try {
        console.log("Deleting resource at:", path);
        // 1. Try deleting from the provided path
        let encodedPath = encodeURIComponent(path);
        let res = await yandexRequest(`?path=${encodedPath}&permanently=true`, {
            method: 'DELETE'
        });

        if (res) return true;

        // 2. Fallback: Smart Deletion logic if direct path failed (e.g. path mismatch)
        // Clean path to get filename. Remove 'disk:' prefix if present for parsing
        const cleanPath = path.replace(/^disk:/, '');
        const filename = cleanPath.split('/').pop();

        if (!filename) return false;

        // Regex to find "_Э{number}" followed by underscore or end of some segment
        const screenMatch = filename.match(/_Э(\d+)_/);
        
        if (screenMatch) {
            const screenId = screenMatch[1];
            // Try deleting from Screen folder
            const screenFallback = `${APP_ROOT}/Экран ${screenId}/${filename}`;
            console.log(`Attempting fallback delete from Screen ${screenId}:`, screenFallback);
            
            res = await yandexRequest(`?path=${encodeURIComponent(screenFallback)}&permanently=true`, {
                method: 'DELETE'
            });
            if (res) return true;

            // Try deleting from Moderator folder
            const modFallback = `${MODERATOR_PATH}/${filename}`;
             console.log(`Attempting fallback delete from Moderator:`, modFallback);
            res = await yandexRequest(`?path=${encodeURIComponent(modFallback)}&permanently=true`, {
                method: 'DELETE'
            });
            return res !== null;
        }

        return false;
    } catch (error) {
        console.error("Failed to delete resource:", error);
        return false;
    }
};

export const uploadMediaToModerator = async (file: File, screenId: number, userId: string): Promise<string | null> => {
  try {
    // Ensure moderator folder exists (optimized check)
    const modPathEncoded = encodeURIComponent(MODERATOR_PATH);
    const modExists = await yandexRequest(`?path=${modPathEncoded}`);
    if (!modExists) {
        await yandexRequest(`?path=${modPathEncoded}`, { method: 'PUT' });
    }

    // Naming convention: ScreenID_UserID_Timestamp_Tag_Filename
    // Tag _Э{screenId} is mandatory for routing
    const fileName = `Screen${screenId}_User${userId}_${Date.now()}_Э${screenId}_${file.name}`;
    const relativePath = `${MODERATOR_PATH}/${fileName}`;
    const destPath = encodeURIComponent(relativePath);
    
    const uploadUrlRes = await yandexRequest(`/upload?path=${destPath}&overwrite=true`);
    
    if (!uploadUrlRes || !uploadUrlRes.href) {
      throw new Error("Could not get upload URL");
    }

    // Upload the file (PUT) to the provided href
    const uploadResponse = await fetch(uploadUrlRes.href, {
      method: 'PUT',
      body: file, // Send binary
    });

    if (!uploadResponse.ok) {
        throw new Error("Failed to put file to Yandex Disk");
    }

    // 3. PATCH request to add Custom Property (Tag) to the file
    // We use the original destPath to identify the resource
    await yandexRequest(`?path=${destPath}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            custom_properties: {
                "screen": `Экран ${screenId}`
            }
        })
    });

    // Return the filename so frontend can track it
    return fileName; 
  } catch (error) {
    console.error("Upload failed:", error);
    return null;
  }
};

/**
 * JSON Based Authentication Helpers
 */

const getClientFileName = (email: string) => {
    // Simple sanitization for filename
    const safeEmail = email.trim().replace(/[^a-zA-Z0-9@._-]/g, '_');
    return `user_${safeEmail}.json`;
};

/**
 * Authenticates a user by checking existence of JSON file and verifying password inside it.
 */
export const authenticateUser = async (email: string, password: string): Promise<User> => {
    await ensureClientsDirectory();
    const fileName = getClientFileName(email);
    const filePath = `${CLIENTS_FOLDER_PATH}/${fileName}`;
    const pathEncoded = encodeURIComponent(filePath);

    // 1. Check if file exists
    const metadata = await yandexRequest(`?path=${pathEncoded}`);
    if (!metadata) {
         throw new Error("Неверный Email или пароль"); // User not found
    }

    // 2. Download and read JSON
    const downloadData = await yandexRequest(`/download?path=${pathEncoded}&_t=${Date.now()}`);
    if (!downloadData || !downloadData.href) {
        throw new Error("Ошибка доступа к данным пользователя");
    }

    const fileRes = await fetch(downloadData.href, { 
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
    });
    
    if (!fileRes.ok) {
         throw new Error("Ошибка сети при входе");
    }

    try {
        const userData = await fileRes.json();
        if (String(userData.password) === String(password)) {
             return {
                 id: userData.id,
                 email: userData.email,
                 name: userData.email.split('@')[0]
             };
        } else {
            throw new Error("Неверный Email или пароль");
        }
    } catch (e) {
        throw new Error("Ошибка чтения данных пользователя (Неверный формат JSON)");
    }
};

/**
 * Registers a new client by creating a JSON file.
 */
export const registerClient = async (email: string, password: string): Promise<User> => {
  try {
      await ensureClientsDirectory();
      
      const fileName = getClientFileName(email);
      const filePath = `${CLIENTS_FOLDER_PATH}/${fileName}`;
      const pathEncoded = encodeURIComponent(filePath);

      // 1. Check if already exists
      const exists = await yandexRequest(`?path=${pathEncoded}`);
      if (exists) {
          throw new Error("Пользователь с таким Email уже существует");
      }

      // 2. Prepare User Data
      const uniqueId = Math.random().toString(36).substr(2, 9).toUpperCase();
      const userData = {
          id: uniqueId,
          email,
          password,
          createdAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });

      // 3. Get Upload URL
      const uploadUrlRes = await yandexRequest(`/upload?path=${pathEncoded}&overwrite=true`);
      
      if (uploadUrlRes && uploadUrlRes.href) {
          const putRes = await fetch(uploadUrlRes.href, {
              method: 'PUT',
              body: blob
          });
          if (!putRes.ok) throw new Error(`PUT failed with status ${putRes.status}`);
      } else {
          throw new Error("Не удалось получить ссылку для сохранения.");
      }
      
      return {
          id: uniqueId,
          email: email,
          name: email.split('@')[0]
      };

  } catch (error: any) {
    console.error("Failed to register:", error);
    throw new Error(error.message || "Ошибка при регистрации");
  }
};