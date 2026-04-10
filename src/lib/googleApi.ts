const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

interface GoogleDriveFolder {
  id: string;
  name: string;
}

interface GooglePickerDocumentData {
  id?: string;
  name?: string;
}

interface GoogleDriveVideoFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
}

interface GoogleDriveListResponse<T> {
  files?: T[];
}

interface GoogleSpreadsheetResponse {
  spreadsheetId: string;
}

interface GoogleFileParentsResponse {
  parents?: string[];
}

interface GoogleApiErrorResponse {
  error?: {
    message?: string;
  };
}

interface GoogleTokenClient {
  requestAccessToken: (config?: { prompt?: string }) => void;
}

interface GapiClient {
  load: (url: string) => Promise<void>;
  setToken: (token: { access_token: string }) => void;
}

interface GooglePickerDocsView {
  setIncludeFolders: (enabled: boolean) => GooglePickerDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerDocsView;
  setEnableDrives?: (enabled: boolean) => GooglePickerDocsView;
}

interface GooglePicker {
  setVisible: (visible: boolean) => void;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerDocsView) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setCallback: (callback: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setSize: (width: number, height: number) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  build: () => GooglePicker;
}

declare global {
  interface Window {
    gapi: {
      load: (module: string, callback: () => void) => void;
      client: GapiClient;
    };
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void | Promise<void>;
          }) => GoogleTokenClient;
        };
      };
      picker: {
        Action: {
          CANCEL: string;
          PICKED: string;
        };
        DocsView: new (viewId?: string) => GooglePickerDocsView;
        Document: {
          ID: string;
          NAME: string;
        };
        Feature: {
          SUPPORT_DRIVES: string;
        };
        PickerBuilder: new () => GooglePickerBuilder;
        Response: {
          ACTION: string;
          DOCUMENTS: string;
        };
        ViewId: {
          FOLDERS: string;
        };
      };
    };
  }
}

let tokenClient: GoogleTokenClient | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let googleScriptPromise: Promise<void> | null = null;
let gapiScriptPromise: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById("google-gsi") as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Identity Services")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  }).then(() => {
    if (!window.google?.accounts?.oauth2) {
      googleScriptPromise = null;
      throw new Error("Google Identity Services loaded, but window.google.accounts.oauth2 is unavailable");
    }
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });

  return googleScriptPromise;
}

export function loadGapiScript(): Promise<void> {
  if (window.gapi?.client && window.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }

  if (gapiScriptPromise) {
    return gapiScriptPromise;
  }

  gapiScriptPromise = new Promise<void>((resolve, reject) => {
    const initClient = () => {
      window.gapi.load("client:picker", async () => {
        try {
          await window.gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    };

    const existingScript = document.getElementById("gapi-script") as HTMLScriptElement | null;
    if (existingScript) {
      if (window.gapi?.load) {
        initClient();
        return;
      }

      existingScript.addEventListener("load", initClient, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load GAPI")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = initClient;
    script.onerror = () => reject(new Error("Failed to load GAPI"));
    document.head.appendChild(script);
  }).catch((error) => {
    gapiScriptPromise = null;
    throw error;
  });

  return gapiScriptPromise;
}

export async function initGoogleAuth(
  clientId: string,
  onSuccess: (token: string, userInfo: { email: string; name: string; picture: string }) => void,
): Promise<void> {
  // Load scripts first
  await loadGoogleScript();
  await loadGapiScript();

  // After scripts are loaded, initTokenClient is synchronous
  // so the token client is ready for requestAccessToken()
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: async (response) => {
      if (response.access_token) {
        window.gapi.client.setToken({ access_token: response.access_token });
        const userInfo = await fetchUserInfo(response.access_token);
        onSuccess(response.access_token, userInfo);
        pendingResolve?.(response.access_token);
        pendingResolve = null;
        pendingReject = null;
      } else {
        const error = new Error("Google sign-in was cancelled or failed");
        pendingReject?.(error);
        pendingResolve = null;
        pendingReject = null;
      }
    },
  });
}

export async function ensureGoogleScriptsLoaded(): Promise<void> {
  await loadGoogleScript();
  await loadGapiScript();
}

export function requestAccessToken(): Promise<string> {
  if (!tokenClient) {
    throw new Error("Google Auth not initialized");
  }

  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    try {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to request Google access token";
      pendingReject?.(new Error(message));
      pendingResolve = null;
      pendingReject = null;
    }
  });
}

export async function openDriveFolderPicker(options: {
  accessToken: string;
  developerKey: string;
  appId?: string;
}): Promise<GoogleDriveFolder | null> {
  await loadGapiScript();

  const pickerWidth = Math.min(window.innerWidth - 64, 1000);
  const pickerHeight = Math.min(window.innerHeight * 0.8, 600);

  const originalOverflow = document.body.style.overflow;
  const originalPaddingRight = document.body.style.paddingRight;

  const pickerStyleId = "google-picker-custom-styles";
  
  const lockBodyScroll = () => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    
    // Add custom styles to center the picker
    if (!document.getElementById(pickerStyleId)) {
      const style = document.createElement("style");
      style.id = pickerStyleId;
      style.textContent = `
        .picker-dialog {
          position: fixed !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          margin: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }
  };

  const unlockBodyScroll = () => {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
    
    // Remove custom styles
    const styleElement = document.getElementById(pickerStyleId);
    if (styleElement) {
      styleElement.remove();
    }
  };

  lockBodyScroll();

  return new Promise<GoogleDriveFolder | null>((resolve, reject) => {
    // View for browsing and selecting - shows both files and folders
    const docsView = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);

    const handleResolve = (result: GoogleDriveFolder | null) => {
      unlockBodyScroll();
      resolve(result);
    };

    const handleReject = (error: Error) => {
      unlockBodyScroll();
      reject(error);
    };

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .addView(docsView)
      .setDeveloperKey(options.developerKey)
      .setOAuthToken(options.accessToken)
      .setOrigin(window.location.protocol + "//" + window.location.host)
      .setSize(pickerWidth, pickerHeight)
      .setTitle("Select a Google Drive folder")
      .setCallback((data) => {
        const action = data[window.google.picker.Response.ACTION];

        if (action === window.google.picker.Action.CANCEL) {
          handleResolve(null);
          return;
        }

        if (action !== window.google.picker.Action.PICKED) {
          return;
        }

        const documents = data[window.google.picker.Response.DOCUMENTS];
        const [selectedFolder] = Array.isArray(documents) ? (documents as GooglePickerDocumentData[]) : [];

        if (!selectedFolder?.id || !selectedFolder?.name) {
          handleReject(new Error("Google Picker did not return a valid folder selection"));
          return;
        }

        handleResolve({
          id: selectedFolder.id,
          name: selectedFolder.name,
        });
      });

    if (options.appId) {
      pickerBuilder.setAppId(options.appId);
    }

    pickerBuilder.build().setVisible(true);
  });
}

async function fetchUserInfo(token: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as GoogleUserInfo;

  return { email: data.email || "", name: data.name || "", picture: data.picture || "" };
}

export async function searchDriveFolder(folderName: string, accessToken: string): Promise<GoogleDriveFolder | null> {
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to search for Drive folder"));
  }

  const data = (await res.json()) as GoogleDriveListResponse<GoogleDriveFolder>;
  return data.files?.[0] || null;
}

export async function listVideosInFolder(folderId: string, accessToken: string): Promise<GoogleDriveVideoFile[]> {
  const q = `'${folderId}' in parents and (mimeType contains 'video/') and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,webViewLink)&pageSize=100&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to load videos from Google Drive"));
  }

  const data = (await res.json()) as GoogleDriveListResponse<GoogleDriveVideoFile>;
  return data.files || [];
}

export async function downloadFileAsBlob(fileId: string, accessToken: string): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.statusText}`);
  }

  return res.blob();
}

export async function createSpreadsheet(title: string, headers: string[], accessToken: string): Promise<string> {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: { title: "Evaluations" },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: headers.map((h) => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: { textFormat: { bold: true } },
            })),
          }],
        }],
      }],
    }),
  });

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to create Google Sheet"));
  }

  const data = (await res.json()) as GoogleSpreadsheetResponse;
  return data.spreadsheetId;
}

export async function appendToSheet(
  spreadsheetId: string,
  values: (string | number)[][],
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Evaluations!A:Z:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to append rows to Google Sheet"));
  }
}

export async function getSheetValues(
  spreadsheetId: string,
  range: string,
  accessToken: string,
): Promise<(string | number)[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to read Google Sheet"));
  }

  const data = await res.json();
  return data.values || [];
}

export interface EvaluatedVideoInfo {
  name: string;
  clipsEvaluated: number;
  scores: Record<string, number>;
  descriptions: Record<string, string>;
  totalMarks: number;
}

export async function getEvaluatedVideos(
  spreadsheetId: string,
  rubricNames: string[],
  accessToken: string,
): Promise<EvaluatedVideoInfo[]> {
  const values = await getSheetValues(spreadsheetId, "Evaluations!A:Z", accessToken);

  // Skip header row
  const dataRows = values.slice(1);

  return dataRows
    .map((row) => {
      // Row format: [Sr., Name, Clips Evaluated, ...rubricScores, TOTAL MARKS, Description]
      const name = String(row[1] || "");
      const clipsEvaluated = Number(row[2]) || 0;
      const totalMarks = Number(row[row.length - 2]) || 0;
      const description = String(row[row.length - 1] || "");

      // Extract rubric scores (columns 3 to 3 + rubricNames.length - 1)
      const scores: Record<string, number> = {};
      rubricNames.forEach((rubricName, index) => {
        scores[rubricName] = Number(row[3 + index]) || 0;
      });

      return { name, clipsEvaluated, scores, descriptions: { Description: description }, totalMarks };
    })
    .filter((info) => info.name && info.clipsEvaluated > 0);
}

export async function moveFileToFolder(spreadsheetId: string, folderId: string, accessToken: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(await getGoogleApiError(res, "Failed to load Google Drive file parents"));
  }

  const data = (await res.json()) as GoogleFileParentsResponse;
  const previousParents = (data.parents || []).join(",");

  const moveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=${previousParents}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!moveResponse.ok) {
    throw new Error(await getGoogleApiError(moveResponse, "Failed to move file into selected Drive folder"));
  }
}

async function getGoogleApiError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = (await response.json()) as GoogleApiErrorResponse;
    return data.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
