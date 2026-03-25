const SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets";

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

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GapiClient {
  init: (config: Record<string, never>) => Promise<void>;
  setToken: (token: { access_token: string }) => void;
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
    };
  }
}

let tokenClient: GoogleTokenClient | null = null;

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("google-gsi")) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

export function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("gapi-script")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load("client", async () => {
        await window.gapi.client.init({});
        resolve();
      });
    };
    script.onerror = () => reject(new Error("Failed to load GAPI"));
    document.head.appendChild(script);
  });
}

export async function initGoogleAuth(
  clientId: string,
  onSuccess: (token: string, userInfo: { email: string; name: string; picture: string }) => void,
): Promise<void> {
  await loadGoogleScript();
  await loadGapiScript();

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: async (response) => {
      if (response.access_token) {
        window.gapi.client.setToken({ access_token: response.access_token });
        const userInfo = await fetchUserInfo(response.access_token);
        onSuccess(response.access_token, userInfo);
      }
    },
  });
}

export function requestAccessToken() {
  if (!tokenClient) {
    throw new Error("Google Auth not initialized");
  }

  tokenClient.requestAccessToken();
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
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = (await res.json()) as GoogleDriveListResponse<GoogleDriveFolder>;
  return data.files?.[0] || null;
}

export async function listVideosInFolder(folderId: string, accessToken: string): Promise<GoogleDriveVideoFile[]> {
  const q = `'${folderId}' in parents and (mimeType contains 'video/') and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,webViewLink)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = (await res.json()) as GoogleDriveListResponse<GoogleDriveVideoFile>;
  return data.files || [];
}

export async function downloadFileAsBlob(fileId: string, accessToken: string): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
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

  const data = (await res.json()) as GoogleSpreadsheetResponse;
  return data.spreadsheetId;
}

export async function appendToSheet(
  spreadsheetId: string,
  values: (string | number)[][],
  accessToken: string,
): Promise<void> {
  await fetch(
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
}

export async function moveFileToFolder(spreadsheetId: string, folderId: string, accessToken: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = (await res.json()) as GoogleFileParentsResponse;
  const previousParents = (data.parents || []).join(",");

  await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=${previousParents}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}
