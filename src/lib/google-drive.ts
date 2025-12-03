import { google } from 'googleapis';
import { Readable } from 'node:stream';

const DRIVE_SCOPE = ['https://www.googleapis.com/auth/drive.file'];

export interface UploadPdfResult {
  fileId: string;
  webViewLink: string | null;
  webContentLink: string | null;
}

/**
 * Создаёт авторизованный клиент Google Drive
 * на основе сервисного аккаунта из .env.
 */
function getDriveClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  }

  const jwt = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: DRIVE_SCOPE,
  });

  const drive = google.drive({
    version: 'v3',
    auth: jwt,
  });

  return drive;
}

/**
 * Загрузка PDF-файла в папку Mailer_PDF_Transcripts.
 *
 * @param params.chatName — будет использоваться как часть имени файла.
 * @param params.pdfBuffer — содержимое PDF в виде Buffer.
 */
export async function uploadTranscriptPdfToDrive(params: {
  chatName: string;
  pdfBuffer: Buffer;
}): Promise<UploadPdfResult> {
  const { chatName, pdfBuffer } = params;

  const folderId = process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID;
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID is not set');
  }

  const drive = getDriveClient();

  const fileName = `${chatName}.pdf`;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/pdf',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(pdfBuffer),
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  const file = res.data;

  return {
    fileId: file.id as string,
    webViewLink: (file.webViewLink as string) ?? null,
    webContentLink: (file.webContentLink as string) ?? null,
  };
}
