import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";

/**
 * ENV:
 *
 * GOOGLE_SERVICE_ACCOUNT_EMAIL          — email сервисного аккаунта
 * GOOGLE_SERVICE_ACCOUNT_KEY            — private key (как в .env, с \n)
 * GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID    — ID папки Mailer_PDF_Transcripts (Shared Drive)
 */

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let cachedDriveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cachedDriveClient) return cachedDriveClient;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY is not set"
    );
  }

  // Превращаем "...\n...\n" в реальный многострочный ключ
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: DRIVE_SCOPES,
  });

  const drive = google.drive({
    version: "v3",
    auth,
  });

  cachedDriveClient = drive;
  return drive;
}

export type UploadPdfResult = {
  fileId: string;
  webViewLink?: string;
  webContentLink?: string;
};

/**
 * Загрузка PDF в папку Mailer_PDF_Transcripts (Shared Drive).
 */
export async function uploadPdfToDrive(params: {
  fileName: string;
  pdfBuffer: Buffer;
  folderIdOverride?: string;
}): Promise<UploadPdfResult> {
  const drive = getDriveClient();

  const folderId =
    params.folderIdOverride || process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID;

  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID is not set");
  }

  const media = {
    mimeType: "application/pdf",
    body: Readable.from(params.pdfBuffer),
  };

  const requestBody: drive_v3.Schema$File = {
    name: params.fileName,
    mimeType: "application/pdf",
    parents: [folderId],
  };

  const res = await drive.files.create({
    requestBody,
    media,
    fields: "id, webViewLink, webContentLink",
    supportsAllDrives: true, // 🔧 КЛЮЧЕВО ДЛЯ SHARED DRIVE
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error("Drive did not return file id");
  }

  return {
    fileId,
    webViewLink: res.data.webViewLink || undefined,
    webContentLink: res.data.webContentLink || undefined,
  };
}
